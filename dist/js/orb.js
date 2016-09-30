(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.orb = {
    ready: function (api_root, options) {
        options = options || {};
        var scope = options.scope || {};
        var resp;
        var url = api_root + '?returning=schema';

        // support CORS definitions
        if (options.crossDomain) {
            resp = $.getJSON({
                url: url,
                type: 'GET',
                dataType: 'json',
                contentType: 'application/json',
                crossDomain: true,
                processData: false,
                error: options.error
            });
        }

        // use from local API
        else {
            resp = $.get(url, {
                contentType: 'application/json',
                error: options.error
            });
        }

        resp.success(function (schemas) {
            _.each(schemas, function (schema) {
                // create the model
                scope[schema.model] = orb.Schema.generateModel({schema: schema, scope: scope});
            });

            // notify the system on success
            if (options.success !== undefined) {
                options.success(scope);
            }
        });
    }
};

require('./context');
require('./schema');
require('./collection');
require('./model');
require('./queries');

},{"./collection":2,"./context":3,"./model":4,"./queries":5,"./schema":6}],2:[function(require,module,exports){
(function (orb, $) {
    orb.Collection = Backbone.Collection.extend({
        initialize: function (context) {
            context = context || {};

            this.urlRoot = context.urlRoot || undefined;
            this.name = context.name || undefined;
            this.source = context.source || undefined;
            this.context = new orb.Context(context);

            Backbone.Collection.prototype.initialize.call(this, context);
        },
        create: function (properties, options) {
            options = options || {};
            options.url = this.url();
            Backbone.Collection.prototype.create.call(this, properties, options);
        },
        clone: function () {
            var out = Backbone.Collection.prototype.clone.call(this);
            out.context = this.context.clone();
            out.name = this.name;
            out.source = this.source;
            out.urlRoot = this.urlRoot;
            return out;
        },
        fetch: function (options) {
            options = options || {};
            var context = new orb.Context(_.clone(this.context.attributes));
            context.merge(options);

            // if we have context specific options, update the root query
            if (!_.isEmpty(context)) {
                options.data = _.extend({}, options.data, {orb_context: JSON.stringify(context.toJSON())});
            }

            // call the base collection context commands
            return Backbone.Collection.prototype.fetch.call(this, options);
        },
        fetchCount: function (options) {
            options = options || {};

            var self = this;
            var context = new orb.Context(_.extend({}, _.clone(this.context.attributes), {
                returning: 'count'
            }));
            context.merge(options);

            var params = _.extend({}, options, {
                method: 'get',
                url: this.url(),
                data: _.extend({}, options.data, {orb_context: JSON.stringify(context.toJSON())}),
                success: function (response) {
                    if (options.success) {
                        options.success(self, response.count);
                    }
                }
            });
            return $.ajax(params);
        },
        fetchOne: function (options) {
            options = options || {};
            var self = this;

            var context = new orb.Context(_.extend({}, _.clone(this.context.attributes), {
                limit: 1
            }));
            context.merge(options);

            var params = _.extend({}, options, {
                method: 'get',
                limit: 1,
                url: this.url(),
                data: _.extend({}, options.data, {orb_context: JSON.stringify(context.toJSON())}),
                success: function (response) {
                    if (options.success) {
                        var attributes = (response.length) ? response[0] : {};
                        var model = self.model || Bakcbone.Model;
                        options.success(new model(attributes), attributes);
                    }
                }
            });

            return $.ajax(params);
        },
        parse: function (response, options) {
            if (response instanceof Array || response instanceof Backbone.Collection || response instanceof Backbone.Model) {
                return response;
            } else if (response.records !== undefined) {
                return response.records;
            } else {
                var records = [];
                var model_type = this.constructor.model || Backbone.Model;

                if (response.count || response.ids) {
                    var use_undefined = response.ids === undefined;
                    var count = response.count || response.ids.length;
                    records = _.times(count, function (n) {
                        return (use_undefined) ? undefined : {id: response.ids[n]}
                    });

                    if (response.first !== undefined) {
                        records[0] = new model_type(response.first);
                    }
                    if (response.last !== undefined) {
                        records[records.length - 1] = new model_type(response.last);
                    }
                } else {
                    if (response.first !== undefined) {
                        records.push(new model_type(response.first));
                    }
                    if (response.last !== undefined) {
                        records.push(new model_type(response.last));
                    }
                }

                return records;
            }
        },
        refine: function (context) {
            var out = this.clone();
            out.context.merge(this.context.attributes);
            out.context.merge(context);
            return out;
        },
        toJSON: function () {
            var self = this;
            var records = [];

            self.each(function (record) {
                var attrs = record.modifiedAttributes();
                if (!record.isNew()) {
                    attrs[record.idAttribute] = record.id;
                }
                records.push(attrs);
            });

            return records;
        },
        save: function (options) {
            var url = this.url();
            var records = this.toJSON();
            var self = this;
            options = options || {};

            return $.ajax(_.extend({}, options, {
                type: 'put',
                url: url,
                data: JSON.stringify({records: records}),
                contentType: 'application/json',
                success: function (results) {
                    // update the result records
                    self.each(function (model, i) {
                        model.set(model.parse(results[i]));
                    });

                    if (options.success) {
                        options.success(self, results);
                    }
                }
            }));
        },
        url: function () {
            if (this.source && this.name) {
                var root = this.source.urlRoot;

                if (root) {
                    var record_id = this.source.get('id');
                    if (record_id) {
                        var trimmed = s.trim(root, '/');
                        return [trimmed, record_id, this.name].join('/');
                    } else {
                        return root;
                    }
                }
            }
            return this.urlRoot;
        }
    });
})(window.orb, jQuery);
},{}],3:[function(require,module,exports){
(function (orb) {
    var Defaults = {
        'autoIncrementEnabled': true,
        'columns': undefined,
        'db': undefined,
        'database': undefined,
        'distinct': false,
        'disinctOn': '',
        'dryRun': false,
        'expand': undefined,
        'format': 'json',
        'force': false,
        'inflated': true,
        'limit': undefined,
        'locale': undefined,
        'namespace': '',
        'order': undefined,
        'page': undefined,
        'pageSize': undefined,
        'scope': undefined,
        'returning': 'records',
        'start': undefined,
        'timezone': undefined,
        'where': undefined
    };

    orb.Context = Backbone.Model.extend({
        clone: function () {
            var out = Backbone.Model.prototype.clone.call(this);

            // ensure we do a deep copy
            if (out.attributes.columns !== undefined) {
                out.attributes.columns = out.attributes.columns.slice(0);
            }

            if (out.attributes.order !== undefined && typeof out.attributes.order === 'object') {
                out.attributes.order = out.attributes.order.slice(0);
            }

            if (out.attributes.where !== undefined) {
                out.attributes.where = out.attributes.where.clone();
            }

            return out;
        },
        merge: function (other) {
            var self = this;
            _.each(other, function (value, key) {
                if (key === 'where') {
                    var where = self.get('where');
                    if (where) {
                        where = where.and(value);
                    } else {
                        where = value;
                    }
                    self.set('where', where);
                }
                else if (key === 'expand') {
                    var expand = self.get('expand');
                    if (expand) {
                        expand.extend(value);
                    } else {
                        self.set('expand', value);
                    }
                }
                else {
                    self.set(key, value);
                }
            });
        },
        set: function (key, value) {
            var data;
            if (!_.isObject(key)) {
                data = {};
                data[key] = value;
            } else {
                data = key;
            }

            var values = {};
            _.each(data, function (v, k) {
                if (k === 'expand' && typeof v === 'string') {
                    v = v.split(',');
                }

                if (_.keys(Defaults).indexOf(k) !== -1) {
                    values[k] = v;
                }
            });

            Backbone.Model.prototype.set.call(this, values);
        },
        toJSON: function () {
            var out = _.clone(this.attributes);
            if (out.where) {
                out.where = out.where.toJSON();
            }
            return out;
        }
    });
})(window.orb);

},{}],4:[function(require,module,exports){
(function (orb, $) {
    orb.Model = Backbone.Model.extend({
        initialize: function (options) {
            var self = this;
            var schema = self.constructor.schema;

            // define the base attributes of this model
            self.baseAttributes = _.clone(self.defaults);

            // initialize information from the schema
            if (!self._initialized) {
                self._initialized = true;

                self.references = {};
                self.collections = {};

                options = options || {};

                // create the reference information
                if (schema) {
                    _.each(schema.columns, function (column) {
                        if (column.type === 'Reference') {
                            self.references[column.name] = undefined;
                        }

                        // update the base attribute
                        if (!self.isNew() && _.has(options, column.field)) {
                            self.baseAttributes[column.name] = options[column.name];
                        }
                    });

                    _.each(schema.collectors, function (collector) {
                        if (!collector.flags.Static) {
                            if (collector.flags.Unique) {
                                self.references[collector.name] = undefined;
                            } else {
                                var model = schema.referenceScope[collector.model];
                                var records;

                                // use default model
                                if (model) {
                                    records = new model.collection();
                                    records.source = self;
                                    records.name = collector.name;
                                } else {
                                    if (collector.model) {
                                        console.log('[ORB Error] Could not find model: ' + collector.model);
                                    }

                                    records = new Backbone.Collection();
                                    records.url = function () {
                                        return [s.trim(self.urlRoot, '/'), self.get('id'), collector.name].join('/');
                                    };
                                }

                                self.collections[collector.name] = records;
                                self[collector.name] = records;
                            }
                        }
                    });
                }
            }

            // update any reference or collector attributes here
            if (schema) {
                _.each(self.attributes, function (attribute, key) {
                    if (!self.isNew() && _.has(options, key)) {
                        self.baseAttributes[key] = options[key];
                    }

                    if (_.has(self.references, key)) {
                        delete self.attributes[key];
                        if (self.references[key] === undefined) {
                            var model = undefined;
                            _.each(schema.columns, function (column) {
                                if (column.name === key) {
                                    model = schema.referenceScope[column.reference];
                                }
                            });

                            if (model === undefined) {
                                console.log('[ORB Error] Could not find model for: ' + schema.model + '.' + key);
                                model = Backbone.Model;
                            }

                            if (attribute instanceof model) {
                                self.references[key] = attribute;
                            } else {
                                self.references[key] = new model(attribute);
                            }
                        } else {
                            self.references[key].set(attribute);
                        }
                    } else if (_.has(self.collections, key)) {
                        delete self.attributes[key];
                        if (attribute instanceof Backbone.Collection) {
                            self.collections[key] = attribute;
                        } else {
                            var collection = self.collections[key];
                            collection.set(collection.parse(attribute));
                        }
                    }
                });
            }


            // call the base class's method
            Backbone.Model.prototype.initialize.call(this, options);
        },
        fetch: function (options) {
            options = options || {};
            var context = new orb.Context();
            context.merge(options);

            // if we have context specific options, update the root query
            if (!_.isEmpty(context)) {
                options.data = _.extend({}, options.data, {orb_context: JSON.stringify(context.toJSON())});
            }

            Backbone.Model.prototype.fetch.call(this, options);
        },
        clone: function () {
            var copy = Backbone.Model.prototype.clone.call(this);
            copy.baseAttributes = _.clone(this.baseAttributes);
            return copy;
        },
        get: function (attribute) {
            var parts = attribute.split('.');
            attribute = parts[0];
            var self = this;
            var schema = this.constructor.schema;
            if (schema) {
                var collector = schema.collectors[attribute];
                var column = undefined;
                var record = undefined;
                _.each(schema.columns, function (col) {
                    if (col.type === 'Reference' && col.name === attribute) {
                        column = col;
                    }
                });

                // get a reference column
                if (column && column.type === 'Reference') {
                    record = this.references[attribute];
                    if (record === undefined) {
                        var record_id = self.attributes[column.field];
                        if (record_id) {
                            record = new schema.referenceScope[column.reference]({id: self.attributes[column.field]});
                            this.references[column.name] = record;
                        }
                    }

                    if (parts.length > 1 && record !== undefined) {
                        return record.get(parts.slice(1).join('.'));
                    } else {
                        return record;
                    }
                }

                // get a collection of objects
                else if (collector) {
                    if (collector.flags.Unique) {
                        record = this.references[attribute];
                        if (record === undefined) {
                            record = new schema.referenceScope[collector.model]();
                            record.urlRoot = this.url() + '/' + name;
                            this.references[attribute] = record;
                        }
                        return record;
                    } else {
                        return this.collections[attribute];
                    }
                }

                // get a regular attribute
                else {
                    return Backbone.Model.prototype.get.call(this, attribute);
                }
            }

            // get a regular attribute
            else {
                return Backbone.Model.prototype.get.call(this, attribute);
            }
        },
        modifiedAttributes: function () {
            var output = {};
            var self = this;
            var schema = this.constructor.schema;

            _.each(this.attributes, function (value, attr) {
                if (!_.isEqual(value, self.baseAttributes[attr])) {
                    if (!(schema && schema.columns[attr] && schema.columns[attr].flags.ReadOnly)) {
                        output[attr] = value;
                    }
                }
            });

            return output;
        },
        parse: function (response, options) {
            if (this.references === undefined) {
                this.initialize();
            }

            var self = this;
            var schema = self.constructor.schema;

            if (schema && response) {
                // load references
                _.each(schema.columns, function (column) {
                    if (column.type === 'Reference') {
                        var data = response[column.name];
                        delete response[column.name];
                        if (data !== undefined) {
                            if (!self.references[column.name]) {
                                self.references[column.name] = new schema.referenceScope[column.reference](data);
                            } else {
                                self.references[column.name].set(data);
                            }
                        }
                    }

                    // update the base attributes with the newly parsed ones
                    if (_.has(response, column.field)) {
                        self.baseAttributes[column.field] = response[column.field];
                    }
                });

                // load collectors
                _.each(schema.collectors, function (collector) {
                    var data = response[collector.name];
                    delete response[collector.name];
                    if (data) {
                        if (collector.flags.Unique) {
                            if (!self.references[collector.name]) {
                                self.references[collector.name] = new schema.referenceScope[collector.model](data);
                            } else {
                                self.references[collector.name].set(data);
                            }
                        } else {
                            var collection = self.collections[collector.name];
                            collection.set(collection.parse(data));
                        }
                    }
                });
            }

            // process the base call
            return Backbone.Model.prototype.parse.call(this, response, options);
        },
        reset: function () {
            var self = this;
            _.each(self.baseAttributes, function (value, attr) {
                self.set(attr, value);
            });
        },
        save: function (attrs, options) {
            options = options || {};
            var my_attrs =  _.clone(attrs || this.attributes);
            var include = options.include || '';
            var expand = options.expand ? [options.expand] : [];
            var self = this;

            // TODO: What is this and why ? If include is not an array only then split it.
            if(!Array.isArray(include)){
                include = include.split(',')
            }

            // include any collector information here
            _.each(include, function (name) {
                var collection = self.collections[name];
                if (collection !== undefined) {
                    my_attrs[name] = collection.toJSON();
                    expand.push(name);
                }
            });

            // ignore any read-only attributes
            var schema = self.constructor.schema;
            var is_new = self.isNew();
            if (schema !== undefined) {
                _.each(schema.columns, function (column) {
                    if (column.flags.ReadOnly) {
                        delete my_attrs[column.field];
                        delete my_attrs[column.name];
                    } else if (is_new && my_attrs[column.field] === null) {
                        delete my_attrs[column.field];
                        delete my_attrs[column.name];
                    }
                });
            }

            if (expand.length) {
                my_attrs.orb_context = {expand: expand.join(',')};
            }
            options.attrs = my_attrs;

            return Backbone.Model.prototype.save.call(this, attrs, options);
        },
        set: function (attributes, options) {
            if (options !== undefined && typeof attributes === 'string') {
                var new_attrib = {};
                new_attrib[attributes] = options;
                attributes = new_attrib;
            }

            var self = this;
            var schema = this.constructor.schema;
            _.each(attributes, function (value, attribute) {
                // set reference information
                if (_.has(self.references, attribute)) {
                    var field = undefined;
                    var model = undefined;
                    _.each(schema.columns, function (col) {
                        if (col.name === attribute) {
                            field = col.field;
                            model = schema.referenceScope[col.reference];
                        }
                    });

                    delete attributes[attribute];

                    if (value instanceof Object ) {
                        if(value instanceof Backbone.Model){
                            self.references[attribute] = value;
                        } else if(self.references[attribute]) {
                            self.references[attribute].set(value);
                        } else if (model) {
                            self.references[attribute] = new model(value);
                        }
                        if (field && value.id) {
                            attributes[field] = value.id;
                        }
                    } else {
                        delete self.references[attribute];
                        if (field) {
                            attributes[field] = value;
                        }
                    }
                }

                // set collection information
                else if (_.has(self.collections, attribute)) {
                    delete attributes[attribute];
                    if (value instanceof Backbone.Collection) {
                        self.collections[attribute] = value;
                    } else {
                        var collection = self.collections[attribute];
                        collection.set(collection.parse(value));
                    }
                }
            });

            return Backbone.Model.prototype.set.call(this, attributes);
        },
        unset: function (attribute, options) {
            // unset a reference object
            if (this.references[name] !== undefined) {
                options = options || {};
                var data = this.references[name];
                delete this.references[name];
                if (!options.silent) {
                    this.trigger('change:' + name, data);
                }
                return true;
            }

            // unset a collection
            else if (this.collections[attribute] !== undefined) {
                this.collections[attribute].reset();
                return true;
            }

            // unset an attribute
            else {
                return Backbone.Model.prototype.unset.call(this, attribute, options);
            }
        },
        url: function () {
            if (this.collection) {
                var id = this.get('id');
                if (id) {
                    return this.collection.url() + '/' + id;
                } else {
                    return this.collection.url();
                }
            } else {
                return Backbone.Model.prototype.url.call(this);
            }
        }
    }, {
        schema: undefined,
        collection: orb.Collection,
        all: function (options) {
            var all_options = _.extend({limit: null}, options);
            return this.select(all_options);
        },
        select: function (context) {
            var records = new this.collection(context);
            records.urlRoot = this.prototype.urlRoot;
            records.model = this;
            return records;
        },
        byId: function (id, context) {
            context = context || {};
            var q = new orb.Q('id').is(id);
            context.where = q.and(context.where);
            return this.select().fetchOne(context);
        }
    });
})(window.orb);

},{}],5:[function(require,module,exports){
(function (orb) {
    // define the base query type
    orb.Q = Backbone.Model.extend({
        defaults: {
            op: '==',
            column: undefined,
            table: '',
            caseSensitive: false,
            functions: undefined,
            math: undefined,
            inverted: false,
            value: undefined
        },
        initialize: function (options) {
            if (typeof(options) === 'string') {
                this.set('column', options);
            }
            if (this.get('functions') === undefined) {
                this.set('functions', []);
            }
            if (this.get('math') === undefined) {
                this.set('math', []);
            }
        },
        after: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.After);
            out.set('value', value);
            return out;
        },
        abs: function () {
            var out = this.clone();
            out.modify(this.Function.Abs);
            return out;
        },
        and: function (other) {
            if (other === undefined || other.isNull()) {
                return this;
            } else if (this.isNull()) {
                return other;
            } else {
                return new orb.QCompound({
                    op: orb.Q.Op.And,
                    queries: [this, other]
                });
            }
        },
        asString: function () {
            var out = this.clone();
            out.modify(orb.Q.Op.AsString);
            return out;
        },
        before: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.Before);
            out.set('value', value);
            return out;
        },
        between: function (a, b) {
            var out = this.clone();
            out.set('op', orb.Q.Op.Between);
            out.set('value', [a, b]);
            return out;
        },
        contains: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.clone();
            out.set('op', orb.Q.Op.Contains);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        clone: function () {
            var attrs = _.extend({}, this.attributes);
            attrs['functions'] = attrs['functions'].slice(0);
            attrs['math'] = attrs['math'].slice(0);
            return new orb.Q(attrs);
        },
        doesNotContain: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.clone();
            out.set('op', orb.Q.Op.DoesNotContain);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        doesNotEndwith: function (value, caseSensitive) {
            caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.clone();
            out.set('op', orb.Q.Op.DoesNotEndwith);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        doesNotMatch: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.clone();
            out.set('op', orb.Q.Op.DoesNotMatch);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        doesNotStartwith: function (value, caseSensitive) {
            caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.clone();
            out.set('op', orb.Q.Op.DoesNotStartwith);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        endswith: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.Endswith);
            out.set('value', value);
            return out;
        },
        greaterThan: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.GreaterThan);
            out.set('value', value);
            return out;
        },
        greaterThanOrEqual: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.GreaterThanOrEqual);
            out.set('value', value);
            return out;
        },
        is: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.Is);
            out.set('value', value);
            return out;
        },
        isNot: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.IsNot);
            out.set('value', value);
            return out;
        },
        isNull: function () {
            return (this.get('column') === undefined || this.get('value') === undefined);
        },
        isUndefined: function () {
            return this.get('value') === undefined;
        },
        in: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.IsIn);
            out.set('value', value.slice(0));
            return out;
        },
        notIn: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.IsNotIn);
            out.set('value', value.slice(0));
            return out;
        },
        lessThan: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.LessThan);
            out.set('value', value.slice(0));
            return out;
        },
        lessThanOrEqual: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.LessThanOrEqual);
            out.set('value', value);
            return out;
        },
        lower: function () {
            var out = this.clone();
            out.modify(this.Function.Lower);
        },
        matches: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? true : caseSensitive;
            var out = this.clone();
            out.set('op', orb.Q.Op.Matches);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        modify: function (func) {
            this.get('functions').push(func);
        },
        or: function (other) {
            if (other === undefined || other.isNull()) {
                return this;
            } else if (this.isNull()) {
                return other;
            } else {
                return new orb.QCompound({
                    op: orb.Q.Op.Or,
                    queries: [this, other]
                });
            }
        },
        startswith: function (value) {
            var out = this.clone();
            out.set('op', orb.Q.Op.Startswith);
            out.set('value', value);
            return out;
        },
        toJSON: function () {
            var data = {
                type: 'query',
                column: this.get('column'),
                op: orb.Q.Op.key(this.get('op')),
                value: this.get('value')
            };

            var funcs = this.get('functions');
            if (!_.isEmpty(funcs)) {
                var jfuncs = [];
                _.each(funcs, function (func) {
                    jfuncs.push(orb.Q.Function.key(func));
                });
                data.functions = jfuncs;
            }

            var math = this.get('math');
            if (!_.isEmpty(math)) {
                var jmath = [];
                _.each(math, function (op) {
                    jmath.push(orb.Q.Math.key(op));
                });
                data.math = jmath;
            }

            return data;
        },
        upper: function () {
            var out = this.clone();
            out.modify(this.Funtions.Upper);
        }
    }, {
        Op: {
            Is: '==',
            IsNot: '!=',
            LessThan: '<',
            LessThanOrEqual: '<=',
            Before: '<',
            GreaterThan: '>',
            GreaterThanOrEqual: '>=',
            After: '>',
            Between: 'between',
            Contains: 'contains',
            DoesNotContain: "doesn't contain",
            Startswith: 'startswith',
            Endswith: 'endswith',
            Matches: 'matches',
            DoesNotMatch: "doesn't match",
            IsIn: 'is in',
            IsNotIn: 'is not in',
            DoesNotStartwith: "doesn't startwith",
            DoesNotEndwith: "doesn't endwith",
            And: 'and',
            Or: 'or',

            key: function (value) {
                var key = undefined;
                _.find(this, function (v, k) {
                    if (v === value) {
                        key = k;
                        return true;
                    } else {
                        return false;
                    }
                });
                return key;
            }
        },
        Math: {
            Add: '+',
            Subtract: '-',
            Multiply: '*',
            Divide: '/',
            And: '&',
            Or: '|',

            key: function (value) {
                var key = undefined;
                _.find(this, function (v, k) {
                    if (v === value) {
                        key = k;
                        return true;
                    } else {
                        return false;
                    }
                });
                return key;
            }
        },
        Function: {
            Lower: 'lower',
            Upper: 'upper',
            Abs: 'abs',
            AsString: 'str',

            key: function (value) {
                var key = undefined;
                _.find(this, function (v, k) {
                    if (v === value) {
                        key = k;
                        return true;
                    } else {
                        return false;
                    }
                });
                return key;
            }
        }
    });

    orb.QCompound = Backbone.Model.extend({
        defaults: {
            op: 'and'
        },
        initialize: function (options) {
            options = options || {};
            var sub_q = options.queries;
            this.queries = (sub_q instanceof Backbone.Collection) ? sub_q : new Backbone.Collection(sub_q);
        },
        and: function (other) {
            if (other === undefined || other.isNull()) {
                return this;
            } else if (this.isNull()) {
                return other;
            } else if (this.get('op') === orb.Q.Op.And) {
                var new_queries = this.queries.slice(0);
                new_queries.push(other);
                return new orb.QCompound({op: orb.Q.Op.And, queries: new_queries});
            } else {
                return new orb.QCompound({op: orb.Q.Op.And, queries: new Backbone.Collection([this, other])});
            }
        },
        clone: function () {
            var options = {
                op: this.get('op'),
                queries: this.queries.clone()
            };
            return new orb.QCompound(options);
        },
        isNull: function () {
            var am_null = true;
            this.queries.each(function (subquery) {
                if (!subquery.isNull()) {
                    am_null = false;
                }
            });
            return am_null;
        },
        or: function (other) {
            if (other === undefined || other.isNull()) {
                return this;
            } else if (this.isNull()) {
                return other;
            } else if (this.get('op') === orb.Q.Op.Or) {
                var new_queries = this.queries.slice(0);
                new_queries.push(other);
                return new orb.QCompound({op: orb.Q.Op.Or, queries: new_queries});
            } else {
                return new orb.QCompound({op: orb.Q.Op.Or, queries: [this, other]});
            }
        },
        toJSON: function () {
            return {
                type: 'compound',
                op: orb.Q.Op.key(this.get('op')),
                queries: this.queries.toJSON()
            };
        }
    });
})(window.orb);
},{}],6:[function(require,module,exports){
(function (orb, $) {
    orb.Index = Backbone.Model.extend({
        defaults: {
            name: '',
            dbname: '',
            unique: false,
            order: undefined,
            cached: false,
            timeout: 0
        },
        initialize: function () {
            var Columns = Backbone.Collection.extend({
                model: orb.Column
            });

            this.columns = new Columns();
        },
        toJSON: function () {
            return {
                name: this.get('name'),
                dbname: this.get('dbname'),
                unique: this.get('unique'),
                order: this.get('order'),
                cached: this.get('cached'),
                timeout: this.get('timeout')
            }
        }
    });

    orb.Pipe = Backbone.Model.extend({
        defaults: {
            name: '',
            through: '',
            from: '',
            to: '',
            unique: false
        },
        toJSON: function () {
            return {
                name: this.get('name'),
                through: this.get('through'),
                from: this.get('from'),
                to: this.get('to'),
                unique: this.get('unique')
            };
        }
    });

    orb.Column = Backbone.Model.extend({
        defaults: {
            type: '',
            name: '',
            field: '',
            display: '',
            reference: undefined,
            index: undefined,
            flags: 0,
            default: undefined,
            defaultOrder: 'asc'
        },
        testFlag: function (flag) {
            return (self.get('flags') & flag) > 0;
        },
        toJSON: function () {
            var index = this.get('index');
            var index_json = undefined;
            if (index) {
                index_json = {
                    name: index.get('name'),
                    cached: index.get('cached'),
                    timeout: index.get('timeout')
                }
            }

            return {
                type: this.get('type'),
                name: this.get('name'),
                field: this.get('field'),
                display: this.get('display'),
                flags: this.get('flags'),
                defaultOrder: this.get('defaultOrder'),
                default: this.get('default'),
                index: index_json
            };
        }
    });

    orb.Schema = Backbone.Model.extend({
        defaults: {
            name: '',
            abstract: false,
            dbname: '',
            display: '',
            inherits: '',
            type: '',
            idColumn: 'id'
        },
        initialize: function () {
            this.columns = new Backbone.Collection();
            this.columns.comparator = function (model) {
                return model.get('name')
            };

            this.indexes = new Backbone.Collection();
            this.indexes.comparator = function (model) {
                return model.get('name');
            };

            this.pipes = new Backbone.Collection();
            this.pipes.comparator = function (model) {
                return model.get('name');
            };
        },
        toJSON: function () {
            return {
                name: this.get('name'),
                abstract: this.get('abstract'),
                dbname: this.get('dbname'),
                display: this.get('display'),
                inherits: this.get('inherits'),
                columns: this.columns.toJSON(),
                indexes: this.indexes.toJSON(),
                pipes: this.pipes.toJSON()
            };
        }
    }, {
        generateModel: function (options) {
            options = options || {};
            var schema = options.schema;
            var scope = options.scope || {};
            var defaults = {};

            schema.referenceScope = scope;

            var cls_methods = {schema: schema};

            // create the default values
            _.each(schema.columns, function (column, field) {
                if (column.type !== 'Id') {
                    defaults[field] = column['default'];
                }
            });

            // load collectors
            _.each(schema.collectors, function (collector) {
                if (collector.flags.Static) {
                    cls_methods[collector.name] = function (context) {
                        var records;
                        if (collector.model) {
                            records = new scope[collector.model].collection();
                        } else {
                            records = new Backbone.Collection();
                        }
                        records.url = schema.urlRoot + '/' + collector.name;
                        return records;
                    };
                }
            });

            // load indexes
            _.each(schema.indexes, function (index) {
                cls_methods[index.name] = function () {
                    var vargs = arguments;
                    if ((arguments.length - 1) !== _.size(index.columns)) {
                        throw ('Invalid number of arguments to ' + schema.model + '.' + index.name);
                    }

                    // create the index query
                    var q = new orb.Q();
                    _.each(index.columns, function (column, i) {
                        q = q.and(new orb.Q(column).is(vargs[i]))
                    });

                    var records = scope[schema.model].select({where: q});
                    var options = vargs[vargs.length - 1];
                    var request;
                    if (index.flags.Unique) {
                        request = records.fetchOne(options);
                    } else {
                        request = records.fetch(options);
                    }
                    return request;
                };
            });

            var modelType = orb.Model.extend({
                idAttribute: schema.idColumn,
                urlRoot: schema.urlRoot,
                defaults: defaults
            }, cls_methods);

            modelType.collection = orb.Collection.extend({
                model: modelType
            });

            return modelType;
        },
    });
})(window.orb, jQuery);
},{}]},{},[1]);
