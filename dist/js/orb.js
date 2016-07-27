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

            // update the base attributes with the newly parsed ones
            _.extend(this.baseAttributes, response);

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

            // include any collector information here
            _.each(include.split(','), function (name) {
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
            options.data = JSON.stringify(my_attrs);

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
            return this.select(options);
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
},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWxsLmpzIiwic3JjL2NvbGxlY3Rpb24uanMiLCJzcmMvY29udGV4dC5qcyIsInNyYy9tb2RlbC5qcyIsInNyYy9xdWVyaWVzLmpzIiwic3JjL3NjaGVtYS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwid2luZG93Lm9yYiA9IHtcbiAgICByZWFkeTogZnVuY3Rpb24gKGFwaV9yb290LCBvcHRpb25zKSB7XG4gICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICB2YXIgc2NvcGUgPSBvcHRpb25zLnNjb3BlIHx8IHt9O1xuICAgICAgICB2YXIgcmVzcDtcbiAgICAgICAgdmFyIHVybCA9IGFwaV9yb290ICsgJz9yZXR1cm5pbmc9c2NoZW1hJztcblxuICAgICAgICAvLyBzdXBwb3J0IENPUlMgZGVmaW5pdGlvbnNcbiAgICAgICAgaWYgKG9wdGlvbnMuY3Jvc3NEb21haW4pIHtcbiAgICAgICAgICAgIHJlc3AgPSAkLmdldEpTT04oe1xuICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdHRVQnLFxuICAgICAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICBjcm9zc0RvbWFpbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICBwcm9jZXNzRGF0YTogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IG9wdGlvbnMuZXJyb3JcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdXNlIGZyb20gbG9jYWwgQVBJXG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmVzcCA9ICQuZ2V0KHVybCwge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICAgZXJyb3I6IG9wdGlvbnMuZXJyb3JcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzcC5zdWNjZXNzKGZ1bmN0aW9uIChzY2hlbWFzKSB7XG4gICAgICAgICAgICBfLmVhY2goc2NoZW1hcywgZnVuY3Rpb24gKHNjaGVtYSkge1xuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgbW9kZWxcbiAgICAgICAgICAgICAgICBzY29wZVtzY2hlbWEubW9kZWxdID0gb3JiLlNjaGVtYS5nZW5lcmF0ZU1vZGVsKHtzY2hlbWE6IHNjaGVtYSwgc2NvcGU6IHNjb3BlfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gbm90aWZ5IHRoZSBzeXN0ZW0gb24gc3VjY2Vzc1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuc3VjY2VzcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5zdWNjZXNzKHNjb3BlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufTtcblxucmVxdWlyZSgnLi9jb250ZXh0Jyk7XG5yZXF1aXJlKCcuL3NjaGVtYScpO1xucmVxdWlyZSgnLi9jb2xsZWN0aW9uJyk7XG5yZXF1aXJlKCcuL21vZGVsJyk7XG5yZXF1aXJlKCcuL3F1ZXJpZXMnKTtcbiIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLkNvbGxlY3Rpb24gPSBCYWNrYm9uZS5Db2xsZWN0aW9uLmV4dGVuZCh7XG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gICAgICAgICAgICBjb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICAgICAgICAgICAgdGhpcy51cmxSb290ID0gY29udGV4dC51cmxSb290IHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMubmFtZSA9IGNvbnRleHQubmFtZSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZSA9IGNvbnRleHQuc291cmNlIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dCA9IG5ldyBvcmIuQ29udGV4dChjb250ZXh0KTtcblxuICAgICAgICAgICAgQmFja2JvbmUuQ29sbGVjdGlvbi5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIGNvbnRleHQpO1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGU6IGZ1bmN0aW9uIChwcm9wZXJ0aWVzLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIG9wdGlvbnMudXJsID0gdGhpcy51cmwoKTtcbiAgICAgICAgICAgIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNyZWF0ZS5jYWxsKHRoaXMsIHByb3BlcnRpZXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNsb25lLmNhbGwodGhpcyk7XG4gICAgICAgICAgICBvdXQuY29udGV4dCA9IHRoaXMuY29udGV4dC5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0Lm5hbWUgPSB0aGlzLm5hbWU7XG4gICAgICAgICAgICBvdXQuc291cmNlID0gdGhpcy5zb3VyY2U7XG4gICAgICAgICAgICBvdXQudXJsUm9vdCA9IHRoaXMudXJsUm9vdDtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgY29udGV4dCA9IG5ldyBvcmIuQ29udGV4dChfLmNsb25lKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKSk7XG4gICAgICAgICAgICBjb250ZXh0Lm1lcmdlKG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGNvbnRleHQgc3BlY2lmaWMgb3B0aW9ucywgdXBkYXRlIHRoZSByb290IHF1ZXJ5XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShjb250ZXh0KSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YSA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLmRhdGEsIHtvcmJfY29udGV4dDogSlNPTi5zdHJpbmdpZnkoY29udGV4dC50b0pTT04oKSl9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjb2xsZWN0aW9uIGNvbnRleHQgY29tbWFuZHNcbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Db2xsZWN0aW9uLnByb3RvdHlwZS5mZXRjaC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaENvdW50OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBjb250ZXh0ID0gbmV3IG9yYi5Db250ZXh0KF8uZXh0ZW5kKHt9LCBfLmNsb25lKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKSwge1xuICAgICAgICAgICAgICAgIHJldHVybmluZzogJ2NvdW50J1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgY29udGV4dC5tZXJnZShvcHRpb25zKTtcblxuICAgICAgICAgICAgdmFyIHBhcmFtcyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnZ2V0JyxcbiAgICAgICAgICAgICAgICB1cmw6IHRoaXMudXJsKCksXG4gICAgICAgICAgICAgICAgZGF0YTogXy5leHRlbmQoe30sIG9wdGlvbnMuZGF0YSwge29yYl9jb250ZXh0OiBKU09OLnN0cmluZ2lmeShjb250ZXh0LnRvSlNPTigpKX0pLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3Moc2VsZiwgcmVzcG9uc2UuY291bnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gJC5hamF4KHBhcmFtcyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoT25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIHZhciBjb250ZXh0ID0gbmV3IG9yYi5Db250ZXh0KF8uZXh0ZW5kKHt9LCBfLmNsb25lKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKSwge1xuICAgICAgICAgICAgICAgIGxpbWl0OiAxXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICBjb250ZXh0Lm1lcmdlKG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB2YXIgcGFyYW1zID0gXy5leHRlbmQoe30sIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdnZXQnLFxuICAgICAgICAgICAgICAgIGxpbWl0OiAxLFxuICAgICAgICAgICAgICAgIHVybDogdGhpcy51cmwoKSxcbiAgICAgICAgICAgICAgICBkYXRhOiBfLmV4dGVuZCh7fSwgb3B0aW9ucy5kYXRhLCB7b3JiX2NvbnRleHQ6IEpTT04uc3RyaW5naWZ5KGNvbnRleHQudG9KU09OKCkpfSksXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhdHRyaWJ1dGVzID0gKHJlc3BvbnNlLmxlbmd0aCkgPyByZXNwb25zZVswXSA6IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1vZGVsID0gc2VsZi5tb2RlbCB8fCBCYWtjYm9uZS5Nb2RlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2VzcyhuZXcgbW9kZWwoYXR0cmlidXRlcyksIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiAkLmFqYXgocGFyYW1zKTtcbiAgICAgICAgfSxcbiAgICAgICAgcGFyc2U6IGZ1bmN0aW9uIChyZXNwb25zZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHJlc3BvbnNlIGluc3RhbmNlb2YgQXJyYXkgfHwgcmVzcG9uc2UgaW5zdGFuY2VvZiBCYWNrYm9uZS5Db2xsZWN0aW9uIHx8IHJlc3BvbnNlIGluc3RhbmNlb2YgQmFja2JvbmUuTW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3BvbnNlLnJlY29yZHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5yZWNvcmRzO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVjb3JkcyA9IFtdO1xuICAgICAgICAgICAgICAgIHZhciBtb2RlbF90eXBlID0gdGhpcy5jb25zdHJ1Y3Rvci5tb2RlbCB8fCBCYWNrYm9uZS5Nb2RlbDtcblxuICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5jb3VudCB8fCByZXNwb25zZS5pZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHVzZV91bmRlZmluZWQgPSByZXNwb25zZS5pZHMgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvdW50ID0gcmVzcG9uc2UuY291bnQgfHwgcmVzcG9uc2UuaWRzLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkcyA9IF8udGltZXMoY291bnQsIGZ1bmN0aW9uIChuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHVzZV91bmRlZmluZWQpID8gdW5kZWZpbmVkIDoge2lkOiByZXNwb25zZS5pZHNbbl19XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5maXJzdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzWzBdID0gbmV3IG1vZGVsX3R5cGUocmVzcG9uc2UuZmlyc3QpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5sYXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHNbcmVjb3Jkcy5sZW5ndGggLSAxXSA9IG5ldyBtb2RlbF90eXBlKHJlc3BvbnNlLmxhc3QpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLmZpcnN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChuZXcgbW9kZWxfdHlwZShyZXNwb25zZS5maXJzdCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5sYXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChuZXcgbW9kZWxfdHlwZShyZXNwb25zZS5sYXN0KSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVmaW5lOiBmdW5jdGlvbiAoY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKGNvbnRleHQpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IFtdO1xuXG4gICAgICAgICAgICBzZWxmLmVhY2goZnVuY3Rpb24gKHJlY29yZCkge1xuICAgICAgICAgICAgICAgIHZhciBhdHRycyA9IHJlY29yZC5tb2RpZmllZEF0dHJpYnV0ZXMoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlY29yZC5pc05ldygpKSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dHJzW3JlY29yZC5pZEF0dHJpYnV0ZV0gPSByZWNvcmQuaWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChhdHRycyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgIH0sXG4gICAgICAgIHNhdmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgdXJsID0gdGhpcy51cmwoKTtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gdGhpcy50b0pTT04oKTtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgICAgICByZXR1cm4gJC5hamF4KF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3B1dCcsXG4gICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgZGF0YTogSlNPTi5zdHJpbmdpZnkoe3JlY29yZHM6IHJlY29yZHN9KSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgdGhlIHJlc3VsdCByZWNvcmRzXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZWFjaChmdW5jdGlvbiAobW9kZWwsIGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsLnNldChtb2RlbC5wYXJzZShyZXN1bHRzW2ldKSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2VzcyhzZWxmLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zb3VyY2UgJiYgdGhpcy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvb3QgPSB0aGlzLnNvdXJjZS51cmxSb290O1xuXG4gICAgICAgICAgICAgICAgaWYgKHJvb3QpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZF9pZCA9IHRoaXMuc291cmNlLmdldCgnaWQnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZF9pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRyaW1tZWQgPSBzLnRyaW0ocm9vdCwgJy8nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBbdHJpbW1lZCwgcmVjb3JkX2lkLCB0aGlzLm5hbWVdLmpvaW4oJy8nKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByb290O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudXJsUm9vdDtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiLCIoZnVuY3Rpb24gKG9yYikge1xuICAgIHZhciBEZWZhdWx0cyA9IHtcbiAgICAgICAgJ2F1dG9JbmNyZW1lbnRFbmFibGVkJzogdHJ1ZSxcbiAgICAgICAgJ2NvbHVtbnMnOiB1bmRlZmluZWQsXG4gICAgICAgICdkYic6IHVuZGVmaW5lZCxcbiAgICAgICAgJ2RhdGFiYXNlJzogdW5kZWZpbmVkLFxuICAgICAgICAnZGlzdGluY3QnOiBmYWxzZSxcbiAgICAgICAgJ2Rpc2luY3RPbic6ICcnLFxuICAgICAgICAnZHJ5UnVuJzogZmFsc2UsXG4gICAgICAgICdleHBhbmQnOiB1bmRlZmluZWQsXG4gICAgICAgICdmb3JtYXQnOiAnanNvbicsXG4gICAgICAgICdmb3JjZSc6IGZhbHNlLFxuICAgICAgICAnaW5mbGF0ZWQnOiB0cnVlLFxuICAgICAgICAnbGltaXQnOiB1bmRlZmluZWQsXG4gICAgICAgICdsb2NhbGUnOiB1bmRlZmluZWQsXG4gICAgICAgICduYW1lc3BhY2UnOiAnJyxcbiAgICAgICAgJ29yZGVyJzogdW5kZWZpbmVkLFxuICAgICAgICAncGFnZSc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3BhZ2VTaXplJzogdW5kZWZpbmVkLFxuICAgICAgICAnc2NvcGUnOiB1bmRlZmluZWQsXG4gICAgICAgICdyZXR1cm5pbmcnOiAncmVjb3JkcycsXG4gICAgICAgICdzdGFydCc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3RpbWV6b25lJzogdW5kZWZpbmVkLFxuICAgICAgICAnd2hlcmUnOiB1bmRlZmluZWRcbiAgICB9O1xuXG4gICAgb3JiLkNvbnRleHQgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5jbG9uZS5jYWxsKHRoaXMpO1xuXG4gICAgICAgICAgICAvLyBlbnN1cmUgd2UgZG8gYSBkZWVwIGNvcHlcbiAgICAgICAgICAgIGlmIChvdXQuYXR0cmlidXRlcy5jb2x1bW5zICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvdXQuYXR0cmlidXRlcy5jb2x1bW5zID0gb3V0LmF0dHJpYnV0ZXMuY29sdW1ucy5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG91dC5hdHRyaWJ1dGVzLm9yZGVyICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIG91dC5hdHRyaWJ1dGVzLm9yZGVyID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIG91dC5hdHRyaWJ1dGVzLm9yZGVyID0gb3V0LmF0dHJpYnV0ZXMub3JkZXIuc2xpY2UoMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvdXQuYXR0cmlidXRlcy53aGVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3V0LmF0dHJpYnV0ZXMud2hlcmUgPSBvdXQuYXR0cmlidXRlcy53aGVyZS5jbG9uZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBtZXJnZTogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBfLmVhY2gob3RoZXIsIGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gJ3doZXJlJykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgd2hlcmUgPSBzZWxmLmdldCgnd2hlcmUnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdoZXJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aGVyZSA9IHdoZXJlLmFuZCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aGVyZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuc2V0KCd3aGVyZScsIHdoZXJlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoa2V5ID09PSAnZXhwYW5kJykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZXhwYW5kID0gc2VsZi5nZXQoJ2V4cGFuZCcpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwYW5kKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBleHBhbmQuZXh0ZW5kKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuc2V0KCdleHBhbmQnLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgZGF0YTtcbiAgICAgICAgICAgIGlmICghXy5pc09iamVjdChrZXkpKSB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IHt9O1xuICAgICAgICAgICAgICAgIGRhdGFba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkYXRhID0ga2V5O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVzID0ge307XG4gICAgICAgICAgICBfLmVhY2goZGF0YSwgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICBpZiAoayA9PT0gJ2V4cGFuZCcgJiYgdHlwZW9mIHYgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSB2LnNwbGl0KCcsJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKF8ua2V5cyhEZWZhdWx0cykuaW5kZXhPZihrKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzW2tdID0gdjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnNldC5jYWxsKHRoaXMsIHZhbHVlcyk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IF8uY2xvbmUodGhpcy5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGlmIChvdXQud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQud2hlcmUgPSBvdXQud2hlcmUudG9KU09OKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiKTtcbiIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLk1vZGVsID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSBzZWxmLmNvbnN0cnVjdG9yLnNjaGVtYTtcbiAgICAgICAgICAgIHNlbGYuYmFzZUF0dHJpYnV0ZXMgPSBfLmNsb25lKHNlbGYuZGVmYXVsdHMpO1xuXG4gICAgICAgICAgICAvLyBpbml0aWFsaXplIGluZm9ybWF0aW9uIGZyb20gdGhlIHNjaGVtYVxuICAgICAgICAgICAgaWYgKCFzZWxmLl9pbml0aWFsaXplZCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2luaXRpYWxpemVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlcyA9IHt9O1xuICAgICAgICAgICAgICAgIHNlbGYuY29sbGVjdGlvbnMgPSB7fTtcblxuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSByZWZlcmVuY2UgaW5mb3JtYXRpb25cbiAgICAgICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi50eXBlID09PSAnUmVmZXJlbmNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sbGVjdG9ycywgZnVuY3Rpb24gKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xsZWN0b3IuZmxhZ3MuU3RhdGljKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5VbmlxdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbW9kZWwgPSBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sbGVjdG9yLm1vZGVsXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZHM7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXNlIGRlZmF1bHQgbW9kZWxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzID0gbmV3IG1vZGVsLmNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMuc291cmNlID0gc2VsZjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMubmFtZSA9IGNvbGxlY3Rvci5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5tb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbT1JCIEVycm9yXSBDb3VsZCBub3QgZmluZCBtb2RlbDogJyArIGNvbGxlY3Rvci5tb2RlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3Jkcy51cmwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtzLnRyaW0oc2VsZi51cmxSb290LCAnLycpLCBzZWxmLmdldCgnaWQnKSwgY29sbGVjdG9yLm5hbWVdLmpvaW4oJy8nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmNvbGxlY3Rpb25zW2NvbGxlY3Rvci5uYW1lXSA9IHJlY29yZHM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGZbY29sbGVjdG9yLm5hbWVdID0gcmVjb3JkcztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdXBkYXRlIGFueSByZWZlcmVuY2Ugb3IgY29sbGVjdG9yIGF0dHJpYnV0ZXMgaGVyZVxuICAgICAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgICAgICAgIF8uZWFjaChzZWxmLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyaWJ1dGUsIGtleSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoXy5oYXMoc2VsZi5yZWZlcmVuY2VzLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgc2VsZi5hdHRyaWJ1dGVzW2tleV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5yZWZlcmVuY2VzW2tleV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtb2RlbCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi5uYW1lID09PSBrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsID0gc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbHVtbi5yZWZlcmVuY2VdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobW9kZWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnW09SQiBFcnJvcl0gQ291bGQgbm90IGZpbmQgbW9kZWwgZm9yOiAnICsgc2NoZW1hLm1vZGVsICsgJy4nICsga2V5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWwgPSBCYWNrYm9uZS5Nb2RlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlIGluc3RhbmNlb2YgbW9kZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2tleV0gPSBhdHRyaWJ1dGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2tleV0gPSBuZXcgbW9kZWwoYXR0cmlidXRlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1trZXldLnNldChhdHRyaWJ1dGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKF8uaGFzKHNlbGYuY29sbGVjdGlvbnMsIGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBzZWxmLmF0dHJpYnV0ZXNba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhdHRyaWJ1dGUgaW5zdGFuY2VvZiBCYWNrYm9uZS5Db2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5jb2xsZWN0aW9uc1trZXldID0gYXR0cmlidXRlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29sbGVjdGlvbiA9IHNlbGYuY29sbGVjdGlvbnNba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uLnNldChjb2xsZWN0aW9uLnBhcnNlKGF0dHJpYnV0ZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjbGFzcydzIG1ldGhvZFxuICAgICAgICAgICAgQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgZmV0Y2g6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBjb250ZXh0ID0gbmV3IG9yYi5Db250ZXh0KCk7XG4gICAgICAgICAgICBjb250ZXh0Lm1lcmdlKG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGNvbnRleHQgc3BlY2lmaWMgb3B0aW9ucywgdXBkYXRlIHRoZSByb290IHF1ZXJ5XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShjb250ZXh0KSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YSA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLmRhdGEsIHtvcmJfY29udGV4dDogSlNPTi5zdHJpbmdpZnkoY29udGV4dC50b0pTT04oKSl9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLmZldGNoLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgICAgICAgdmFyIHBhcnRzID0gYXR0cmlidXRlLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICBhdHRyaWJ1dGUgPSBwYXJ0c1swXTtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSB0aGlzLmNvbnN0cnVjdG9yLnNjaGVtYTtcbiAgICAgICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICAgICAgICB2YXIgY29sbGVjdG9yID0gc2NoZW1hLmNvbGxlY3RvcnNbYXR0cmlidXRlXTtcbiAgICAgICAgICAgICAgICB2YXIgY29sdW1uID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHZhciByZWNvcmQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2wudHlwZSA9PT0gJ1JlZmVyZW5jZScgJiYgY29sLm5hbWUgPT09IGF0dHJpYnV0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uID0gY29sO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBnZXQgYSByZWZlcmVuY2UgY29sdW1uXG4gICAgICAgICAgICAgICAgaWYgKGNvbHVtbiAmJiBjb2x1bW4udHlwZSA9PT0gJ1JlZmVyZW5jZScpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkID0gdGhpcy5yZWZlcmVuY2VzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWNvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZF9pZCA9IHNlbGYuYXR0cmlidXRlc1tjb2x1bW4uZmllbGRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZF9pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZCA9IG5ldyBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sdW1uLnJlZmVyZW5jZV0oe2lkOiBzZWxmLmF0dHJpYnV0ZXNbY29sdW1uLmZpZWxkXX0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSAmJiByZWNvcmQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZC5nZXQocGFydHMuc2xpY2UoMSkuam9pbignLicpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBnZXQgYSBjb2xsZWN0aW9uIG9mIG9iamVjdHNcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjb2xsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5VbmlxdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZCA9IHRoaXMucmVmZXJlbmNlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2xsZWN0b3IubW9kZWxdKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkLnVybFJvb3QgPSB0aGlzLnVybCgpICsgJy8nICsgbmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlZmVyZW5jZXNbYXR0cmlidXRlXSA9IHJlY29yZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gZ2V0IGEgcmVndWxhciBhdHRyaWJ1dGVcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5nZXQuY2FsbCh0aGlzLCBhdHRyaWJ1dGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZ2V0IGEgcmVndWxhciBhdHRyaWJ1dGVcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuZ2V0LmNhbGwodGhpcywgYXR0cmlidXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgbW9kaWZpZWRBdHRyaWJ1dGVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0cHV0ID0ge307XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gdGhpcy5jb25zdHJ1Y3Rvci5zY2hlbWE7XG5cbiAgICAgICAgICAgIF8uZWFjaCh0aGlzLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uICh2YWx1ZSwgYXR0cikge1xuICAgICAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHZhbHVlLCBzZWxmLmJhc2VBdHRyaWJ1dGVzW2F0dHJdKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIShzY2hlbWEgJiYgc2NoZW1hLmNvbHVtbnNbYXR0cl0gJiYgc2NoZW1hLmNvbHVtbnNbYXR0cl0uZmxhZ3MuUmVhZE9ubHkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbYXR0cl0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gb3V0cHV0O1xuICAgICAgICB9LFxuICAgICAgICBwYXJzZTogZnVuY3Rpb24gKHJlc3BvbnNlLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yZWZlcmVuY2VzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmluaXRpYWxpemUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IHNlbGYuY29uc3RydWN0b3Iuc2NoZW1hO1xuXG4gICAgICAgICAgICBpZiAoc2NoZW1hICYmIHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgLy8gbG9hZCByZWZlcmVuY2VzXG4gICAgICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2x1bW4udHlwZSA9PT0gJ1JlZmVyZW5jZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2VbY29sdW1uLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHJlc3BvbnNlW2NvbHVtbi5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbHVtbi5uYW1lXSA9IG5ldyBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sdW1uLnJlZmVyZW5jZV0oZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbHVtbi5uYW1lXS5zZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBsb2FkIGNvbGxlY3RvcnNcbiAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbGxlY3RvcnMsIGZ1bmN0aW9uIChjb2xsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRhdGEgPSByZXNwb25zZVtjb2xsZWN0b3IubmFtZV07XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSByZXNwb25zZVtjb2xsZWN0b3IubmFtZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdG9yLmZsYWdzLlVuaXF1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbY29sbGVjdG9yLm5hbWVdID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2xsZWN0b3IubW9kZWxdKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2xsZWN0b3IubmFtZV0uc2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLmNvbGxlY3Rpb25zW2NvbGxlY3Rvci5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uLnNldChjb2xsZWN0aW9uLnBhcnNlKGRhdGEpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB1cGRhdGUgdGhlIGJhc2UgYXR0cmlidXRlcyB3aXRoIHRoZSBuZXdseSBwYXJzZWQgb25lc1xuICAgICAgICAgICAgXy5leHRlbmQodGhpcy5iYXNlQXR0cmlidXRlcywgcmVzcG9uc2UpO1xuXG4gICAgICAgICAgICAvLyBwcm9jZXNzIHRoZSBiYXNlIGNhbGxcbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUucGFyc2UuY2FsbCh0aGlzLCByZXNwb25zZSwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlc2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBfLmVhY2goc2VsZi5iYXNlQXR0cmlidXRlcywgZnVuY3Rpb24gKHZhbHVlLCBhdHRyKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5zZXQoYXR0ciwgdmFsdWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNhdmU6IGZ1bmN0aW9uIChhdHRycywgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgbXlfYXR0cnMgPSAgXy5jbG9uZShhdHRycyB8fCB0aGlzLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdmFyIGluY2x1ZGUgPSBvcHRpb25zLmluY2x1ZGUgfHwgJyc7XG4gICAgICAgICAgICB2YXIgZXhwYW5kID0gb3B0aW9ucy5leHBhbmQgPyBbb3B0aW9ucy5leHBhbmRdIDogW107XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIC8vIGluY2x1ZGUgYW55IGNvbGxlY3RvciBpbmZvcm1hdGlvbiBoZXJlXG4gICAgICAgICAgICBfLmVhY2goaW5jbHVkZS5zcGxpdCgnLCcpLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICAgICAgICAgIHZhciBjb2xsZWN0aW9uID0gc2VsZi5jb2xsZWN0aW9uc1tuYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoY29sbGVjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIG15X2F0dHJzW25hbWVdID0gY29sbGVjdGlvbi50b0pTT04oKTtcbiAgICAgICAgICAgICAgICAgICAgZXhwYW5kLnB1c2gobmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGlnbm9yZSBhbnkgcmVhZC1vbmx5IGF0dHJpYnV0ZXNcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSBzZWxmLmNvbnN0cnVjdG9yLnNjaGVtYTtcbiAgICAgICAgICAgIHZhciBpc19uZXcgPSBzZWxmLmlzTmV3KCk7XG4gICAgICAgICAgICBpZiAoc2NoZW1hICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi5mbGFncy5SZWFkT25seSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIG15X2F0dHJzW2NvbHVtbi5maWVsZF07XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgbXlfYXR0cnNbY29sdW1uLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzX25ldyAmJiBteV9hdHRyc1tjb2x1bW4uZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgbXlfYXR0cnNbY29sdW1uLmZpZWxkXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBteV9hdHRyc1tjb2x1bW4ubmFtZV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGV4cGFuZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBteV9hdHRycy5vcmJfY29udGV4dCA9IHtleHBhbmQ6IGV4cGFuZC5qb2luKCcsJyl9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3B0aW9ucy5kYXRhID0gSlNPTi5zdHJpbmdpZnkobXlfYXR0cnMpO1xuXG4gICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnNhdmUuY2FsbCh0aGlzLCBhdHRycywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKGF0dHJpYnV0ZXMsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIGF0dHJpYnV0ZXMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19hdHRyaWIgPSB7fTtcbiAgICAgICAgICAgICAgICBuZXdfYXR0cmliW2F0dHJpYnV0ZXNdID0gb3B0aW9ucztcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzID0gbmV3X2F0dHJpYjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IHRoaXMuY29uc3RydWN0b3Iuc2NoZW1hO1xuICAgICAgICAgICAgXy5lYWNoKGF0dHJpYnV0ZXMsIGZ1bmN0aW9uICh2YWx1ZSwgYXR0cmlidXRlKSB7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHJlZmVyZW5jZSBpbmZvcm1hdGlvblxuICAgICAgICAgICAgICAgIGlmIChfLmhhcyhzZWxmLnJlZmVyZW5jZXMsIGF0dHJpYnV0ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZpZWxkID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbW9kZWwgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbC5uYW1lID09PSBhdHRyaWJ1dGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWVsZCA9IGNvbC5maWVsZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbCA9IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2wucmVmZXJlbmNlXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGF0dHJpYnV0ZXNbYXR0cmlidXRlXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBPYmplY3QgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZih2YWx1ZSBpbnN0YW5jZW9mIEJhY2tib25lLk1vZGVsKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbYXR0cmlidXRlXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmKHNlbGYucmVmZXJlbmNlc1thdHRyaWJ1dGVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2F0dHJpYnV0ZV0uc2V0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbYXR0cmlidXRlXSA9IG5ldyBtb2RlbCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgdmFsdWUuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzW2ZpZWxkXSA9IHZhbHVlLmlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHNlbGYucmVmZXJlbmNlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGZpZWxkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXR0cmlidXRlc1tmaWVsZF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHNldCBjb2xsZWN0aW9uIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoXy5oYXMoc2VsZi5jb2xsZWN0aW9ucywgYXR0cmlidXRlKSkge1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgYXR0cmlidXRlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBCYWNrYm9uZS5Db2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmNvbGxlY3Rpb25zW2F0dHJpYnV0ZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjb2xsZWN0aW9uID0gc2VsZi5jb2xsZWN0aW9uc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbi5zZXQoY29sbGVjdGlvbi5wYXJzZSh2YWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuc2V0LmNhbGwodGhpcywgYXR0cmlidXRlcyk7XG4gICAgICAgIH0sXG4gICAgICAgIHVuc2V0OiBmdW5jdGlvbiAoYXR0cmlidXRlLCBvcHRpb25zKSB7XG4gICAgICAgICAgICAvLyB1bnNldCBhIHJlZmVyZW5jZSBvYmplY3RcbiAgICAgICAgICAgIGlmICh0aGlzLnJlZmVyZW5jZXNbbmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgICAgIHZhciBkYXRhID0gdGhpcy5yZWZlcmVuY2VzW25hbWVdO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlZmVyZW5jZXNbbmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKCFvcHRpb25zLnNpbGVudCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoJ2NoYW5nZTonICsgbmFtZSwgZGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB1bnNldCBhIGNvbGxlY3Rpb25cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMuY29sbGVjdGlvbnNbYXR0cmlidXRlXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aW9uc1thdHRyaWJ1dGVdLnJlc2V0KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHVuc2V0IGFuIGF0dHJpYnV0ZVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS51bnNldC5jYWxsKHRoaXMsIGF0dHJpYnV0ZSwgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHVybDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuY29sbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIHZhciBpZCA9IHRoaXMuZ2V0KCdpZCcpO1xuICAgICAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLnVybCgpICsgJy8nICsgaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbi51cmwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUudXJsLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIHNjaGVtYTogdW5kZWZpbmVkLFxuICAgICAgICBjb2xsZWN0aW9uOiBvcmIuQ29sbGVjdGlvbixcbiAgICAgICAgYWxsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBzZWxlY3Q6IGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IG5ldyB0aGlzLmNvbGxlY3Rpb24oY29udGV4dCk7XG4gICAgICAgICAgICByZWNvcmRzLnVybFJvb3QgPSB0aGlzLnByb3RvdHlwZS51cmxSb290O1xuICAgICAgICAgICAgcmVjb3Jkcy5tb2RlbCA9IHRoaXM7XG4gICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgfSxcbiAgICAgICAgYnlJZDogZnVuY3Rpb24gKGlkLCBjb250ZXh0KSB7XG4gICAgICAgICAgICBjb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgICAgICAgICAgIHZhciBxID0gbmV3IG9yYi5RKCdpZCcpLmlzKGlkKTtcbiAgICAgICAgICAgIGNvbnRleHQud2hlcmUgPSBxLmFuZChjb250ZXh0LndoZXJlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdCgpLmZldGNoT25lKGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiKTtcbiIsIihmdW5jdGlvbiAob3JiKSB7XG4gICAgLy8gZGVmaW5lIHRoZSBiYXNlIHF1ZXJ5IHR5cGVcbiAgICBvcmIuUSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBvcDogJz09JyxcbiAgICAgICAgICAgIGNvbHVtbjogdW5kZWZpbmVkLFxuICAgICAgICAgICAgdGFibGU6ICcnLFxuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZTogZmFsc2UsXG4gICAgICAgICAgICBmdW5jdGlvbnM6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIG1hdGg6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGludmVydGVkOiBmYWxzZSxcbiAgICAgICAgICAgIHZhbHVlOiB1bmRlZmluZWRcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Yob3B0aW9ucykgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ2NvbHVtbicsIG9wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KCdmdW5jdGlvbnMnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ2Z1bmN0aW9ucycsIFtdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdldCgnbWF0aCcpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnbWF0aCcsIFtdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYWZ0ZXI6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQWZ0ZXIpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBhYnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVuY3Rpb24uQWJzKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGFuZDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe1xuICAgICAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3AuQW5kLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFzU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeShvcmIuUS5PcC5Bc1N0cmluZyk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBiZWZvcmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmVmb3JlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmV0d2VlbjogZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJldHdlZW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCBbYSwgYl0pO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgY29udGFpbnM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkNvbnRhaW5zKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgY2xvbmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhdHRycyA9IF8uZXh0ZW5kKHt9LCB0aGlzLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgYXR0cnNbJ2Z1bmN0aW9ucyddID0gYXR0cnNbJ2Z1bmN0aW9ucyddLnNsaWNlKDApO1xuICAgICAgICAgICAgYXR0cnNbJ21hdGgnXSA9IGF0dHJzWydtYXRoJ10uc2xpY2UoMCk7XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RKGF0dHJzKTtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdENvbnRhaW46IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RDb250YWluKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdEVuZHdpdGg6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdEVuZHdpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90TWF0Y2g6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RNYXRjaCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RTdGFydHdpdGg6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdFN0YXJ0d2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGVuZHN3aXRoOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkVuZHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZ3JlYXRlclRoYW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuR3JlYXRlclRoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBncmVhdGVyVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuR3JlYXRlclRoYW5PckVxdWFsKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXM6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpc05vdDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc05vdCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLmdldCgnY29sdW1uJykgPT09IHVuZGVmaW5lZCB8fCB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNVbmRlZmluZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgICBpbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc0luKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbm90SW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNOb3RJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxlc3NUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkxlc3NUaGFuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbGVzc1RoYW5PckVxdWFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkxlc3NUaGFuT3JFcXVhbCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxvd2VyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bmN0aW9uLkxvd2VyKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWF0Y2hlczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gdHJ1ZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5NYXRjaGVzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbW9kaWZ5OiBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgdGhpcy5nZXQoJ2Z1bmN0aW9ucycpLnB1c2goZnVuYyk7XG4gICAgICAgIH0sXG4gICAgICAgIG9yOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5PcixcbiAgICAgICAgICAgICAgICAgICAgcXVlcmllczogW3RoaXMsIG90aGVyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBzdGFydHN3aXRoOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLlN0YXJ0c3dpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdxdWVyeScsXG4gICAgICAgICAgICAgICAgY29sdW1uOiB0aGlzLmdldCgnY29sdW1uJyksXG4gICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLmtleSh0aGlzLmdldCgnb3AnKSksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHRoaXMuZ2V0KCd2YWx1ZScpXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgZnVuY3MgPSB0aGlzLmdldCgnZnVuY3Rpb25zJyk7XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShmdW5jcykpIHtcbiAgICAgICAgICAgICAgICB2YXIgamZ1bmNzID0gW107XG4gICAgICAgICAgICAgICAgXy5lYWNoKGZ1bmNzLCBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgICAgICAgICBqZnVuY3MucHVzaChvcmIuUS5GdW5jdGlvbi5rZXkoZnVuYykpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGRhdGEuZnVuY3Rpb25zID0gamZ1bmNzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbWF0aCA9IHRoaXMuZ2V0KCdtYXRoJyk7XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShtYXRoKSkge1xuICAgICAgICAgICAgICAgIHZhciBqbWF0aCA9IFtdO1xuICAgICAgICAgICAgICAgIF8uZWFjaChtYXRoLCBmdW5jdGlvbiAob3ApIHtcbiAgICAgICAgICAgICAgICAgICAgam1hdGgucHVzaChvcmIuUS5NYXRoLmtleShvcCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGRhdGEubWF0aCA9IGptYXRoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgICAgfSxcbiAgICAgICAgdXBwZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVudGlvbnMuVXBwZXIpO1xuICAgICAgICB9XG4gICAgfSwge1xuICAgICAgICBPcDoge1xuICAgICAgICAgICAgSXM6ICc9PScsXG4gICAgICAgICAgICBJc05vdDogJyE9JyxcbiAgICAgICAgICAgIExlc3NUaGFuOiAnPCcsXG4gICAgICAgICAgICBMZXNzVGhhbk9yRXF1YWw6ICc8PScsXG4gICAgICAgICAgICBCZWZvcmU6ICc8JyxcbiAgICAgICAgICAgIEdyZWF0ZXJUaGFuOiAnPicsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbk9yRXF1YWw6ICc+PScsXG4gICAgICAgICAgICBBZnRlcjogJz4nLFxuICAgICAgICAgICAgQmV0d2VlbjogJ2JldHdlZW4nLFxuICAgICAgICAgICAgQ29udGFpbnM6ICdjb250YWlucycsXG4gICAgICAgICAgICBEb2VzTm90Q29udGFpbjogXCJkb2Vzbid0IGNvbnRhaW5cIixcbiAgICAgICAgICAgIFN0YXJ0c3dpdGg6ICdzdGFydHN3aXRoJyxcbiAgICAgICAgICAgIEVuZHN3aXRoOiAnZW5kc3dpdGgnLFxuICAgICAgICAgICAgTWF0Y2hlczogJ21hdGNoZXMnLFxuICAgICAgICAgICAgRG9lc05vdE1hdGNoOiBcImRvZXNuJ3QgbWF0Y2hcIixcbiAgICAgICAgICAgIElzSW46ICdpcyBpbicsXG4gICAgICAgICAgICBJc05vdEluOiAnaXMgbm90IGluJyxcbiAgICAgICAgICAgIERvZXNOb3RTdGFydHdpdGg6IFwiZG9lc24ndCBzdGFydHdpdGhcIixcbiAgICAgICAgICAgIERvZXNOb3RFbmR3aXRoOiBcImRvZXNuJ3QgZW5kd2l0aFwiLFxuICAgICAgICAgICAgQW5kOiAnYW5kJyxcbiAgICAgICAgICAgIE9yOiAnb3InLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgTWF0aDoge1xuICAgICAgICAgICAgQWRkOiAnKycsXG4gICAgICAgICAgICBTdWJ0cmFjdDogJy0nLFxuICAgICAgICAgICAgTXVsdGlwbHk6ICcqJyxcbiAgICAgICAgICAgIERpdmlkZTogJy8nLFxuICAgICAgICAgICAgQW5kOiAnJicsXG4gICAgICAgICAgICBPcjogJ3wnLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgRnVuY3Rpb246IHtcbiAgICAgICAgICAgIExvd2VyOiAnbG93ZXInLFxuICAgICAgICAgICAgVXBwZXI6ICd1cHBlcicsXG4gICAgICAgICAgICBBYnM6ICdhYnMnLFxuICAgICAgICAgICAgQXNTdHJpbmc6ICdzdHInLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLlFDb21wb3VuZCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBvcDogJ2FuZCdcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIHN1Yl9xID0gb3B0aW9ucy5xdWVyaWVzO1xuICAgICAgICAgICAgdGhpcy5xdWVyaWVzID0gKHN1Yl9xIGluc3RhbmNlb2YgQmFja2JvbmUuQ29sbGVjdGlvbikgPyBzdWJfcSA6IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKHN1Yl9xKTtcbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2V0KCdvcCcpID09PSBvcmIuUS5PcC5BbmQpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLnF1ZXJpZXMuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuQW5kLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKFt0aGlzLCBvdGhlcl0pfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNsb25lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBvcDogdGhpcy5nZXQoJ29wJyksXG4gICAgICAgICAgICAgICAgcXVlcmllczogdGhpcy5xdWVyaWVzLmNsb25lKClcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFtX251bGwgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5xdWVyaWVzLmVhY2goZnVuY3Rpb24gKHN1YnF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdWJxdWVyeS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgICAgICBhbV9udWxsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYW1fbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLk9yKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5xdWVyaWVzLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIG5ld19xdWVyaWVzLnB1c2gob3RoZXIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5PciwgcXVlcmllczogW3RoaXMsIG90aGVyXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2NvbXBvdW5kJyxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiB0aGlzLnF1ZXJpZXMudG9KU09OKClcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLkluZGV4ID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZGJuYW1lOiAnJyxcbiAgICAgICAgICAgIHVuaXF1ZTogZmFsc2UsXG4gICAgICAgICAgICBvcmRlcjogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY2FjaGVkOiBmYWxzZSxcbiAgICAgICAgICAgIHRpbWVvdXQ6IDBcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIENvbHVtbnMgPSBCYWNrYm9uZS5Db2xsZWN0aW9uLmV4dGVuZCh7XG4gICAgICAgICAgICAgICAgbW9kZWw6IG9yYi5Db2x1bW5cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBuZXcgQ29sdW1ucygpO1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdGhpcy5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICBkYm5hbWU6IHRoaXMuZ2V0KCdkYm5hbWUnKSxcbiAgICAgICAgICAgICAgICB1bmlxdWU6IHRoaXMuZ2V0KCd1bmlxdWUnKSxcbiAgICAgICAgICAgICAgICBvcmRlcjogdGhpcy5nZXQoJ29yZGVyJyksXG4gICAgICAgICAgICAgICAgY2FjaGVkOiB0aGlzLmdldCgnY2FjaGVkJyksXG4gICAgICAgICAgICAgICAgdGltZW91dDogdGhpcy5nZXQoJ3RpbWVvdXQnKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvcmIuUGlwZSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBuYW1lOiAnJyxcbiAgICAgICAgICAgIHRocm91Z2g6ICcnLFxuICAgICAgICAgICAgZnJvbTogJycsXG4gICAgICAgICAgICB0bzogJycsXG4gICAgICAgICAgICB1bmlxdWU6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdldCgnbmFtZScpLFxuICAgICAgICAgICAgICAgIHRocm91Z2g6IHRoaXMuZ2V0KCd0aHJvdWdoJyksXG4gICAgICAgICAgICAgICAgZnJvbTogdGhpcy5nZXQoJ2Zyb20nKSxcbiAgICAgICAgICAgICAgICB0bzogdGhpcy5nZXQoJ3RvJyksXG4gICAgICAgICAgICAgICAgdW5pcXVlOiB0aGlzLmdldCgndW5pcXVlJylcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5Db2x1bW4gPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgdHlwZTogJycsXG4gICAgICAgICAgICBuYW1lOiAnJyxcbiAgICAgICAgICAgIGZpZWxkOiAnJyxcbiAgICAgICAgICAgIGRpc3BsYXk6ICcnLFxuICAgICAgICAgICAgcmVmZXJlbmNlOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBpbmRleDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZmxhZ3M6IDAsXG4gICAgICAgICAgICBkZWZhdWx0OiB1bmRlZmluZWQsXG4gICAgICAgICAgICBkZWZhdWx0T3JkZXI6ICdhc2MnXG4gICAgICAgIH0sXG4gICAgICAgIHRlc3RGbGFnOiBmdW5jdGlvbiAoZmxhZykge1xuICAgICAgICAgICAgcmV0dXJuIChzZWxmLmdldCgnZmxhZ3MnKSAmIGZsYWcpID4gMDtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgaW5kZXggPSB0aGlzLmdldCgnaW5kZXgnKTtcbiAgICAgICAgICAgIHZhciBpbmRleF9qc29uID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKGluZGV4KSB7XG4gICAgICAgICAgICAgICAgaW5kZXhfanNvbiA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogaW5kZXguZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgICAgIGNhY2hlZDogaW5kZXguZ2V0KCdjYWNoZWQnKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dDogaW5kZXguZ2V0KCd0aW1lb3V0JylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogdGhpcy5nZXQoJ3R5cGUnKSxcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdldCgnbmFtZScpLFxuICAgICAgICAgICAgICAgIGZpZWxkOiB0aGlzLmdldCgnZmllbGQnKSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiB0aGlzLmdldCgnZGlzcGxheScpLFxuICAgICAgICAgICAgICAgIGZsYWdzOiB0aGlzLmdldCgnZmxhZ3MnKSxcbiAgICAgICAgICAgICAgICBkZWZhdWx0T3JkZXI6IHRoaXMuZ2V0KCdkZWZhdWx0T3JkZXInKSxcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB0aGlzLmdldCgnZGVmYXVsdCcpLFxuICAgICAgICAgICAgICAgIGluZGV4OiBpbmRleF9qc29uXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvcmIuU2NoZW1hID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgYWJzdHJhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgZGJuYW1lOiAnJyxcbiAgICAgICAgICAgIGRpc3BsYXk6ICcnLFxuICAgICAgICAgICAgaW5oZXJpdHM6ICcnLFxuICAgICAgICAgICAgdHlwZTogJycsXG4gICAgICAgICAgICBpZENvbHVtbjogJ2lkJ1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zLmNvbXBhcmF0b3IgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbW9kZWwuZ2V0KCduYW1lJylcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHRoaXMuaW5kZXhlcyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmluZGV4ZXMuY29tcGFyYXRvciA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoJ25hbWUnKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHRoaXMucGlwZXMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5waXBlcy5jb21wYXJhdG9yID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgnbmFtZScpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgYWJzdHJhY3Q6IHRoaXMuZ2V0KCdhYnN0cmFjdCcpLFxuICAgICAgICAgICAgICAgIGRibmFtZTogdGhpcy5nZXQoJ2RibmFtZScpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgaW5oZXJpdHM6IHRoaXMuZ2V0KCdpbmhlcml0cycpLFxuICAgICAgICAgICAgICAgIGNvbHVtbnM6IHRoaXMuY29sdW1ucy50b0pTT04oKSxcbiAgICAgICAgICAgICAgICBpbmRleGVzOiB0aGlzLmluZGV4ZXMudG9KU09OKCksXG4gICAgICAgICAgICAgICAgcGlwZXM6IHRoaXMucGlwZXMudG9KU09OKClcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIGdlbmVyYXRlTW9kZWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSBvcHRpb25zLnNjaGVtYTtcbiAgICAgICAgICAgIHZhciBzY29wZSA9IG9wdGlvbnMuc2NvcGUgfHwge307XG4gICAgICAgICAgICB2YXIgZGVmYXVsdHMgPSB7fTtcblxuICAgICAgICAgICAgc2NoZW1hLnJlZmVyZW5jZVNjb3BlID0gc2NvcGU7XG5cbiAgICAgICAgICAgIHZhciBjbHNfbWV0aG9kcyA9IHtzY2hlbWE6IHNjaGVtYX07XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgZGVmYXVsdCB2YWx1ZXNcbiAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbiwgZmllbGQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uLnR5cGUgIT09ICdJZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHNbZmllbGRdID0gY29sdW1uWydkZWZhdWx0J107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGxvYWQgY29sbGVjdG9yc1xuICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5jb2xsZWN0b3JzLCBmdW5jdGlvbiAoY29sbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5TdGF0aWMpIHtcbiAgICAgICAgICAgICAgICAgICAgY2xzX21ldGhvZHNbY29sbGVjdG9yLm5hbWVdID0gZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5tb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBuZXcgc2NvcGVbY29sbGVjdG9yLm1vZGVsXS5jb2xsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3Jkcy51cmwgPSBzY2hlbWEudXJsUm9vdCArICcvJyArIGNvbGxlY3Rvci5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGxvYWQgaW5kZXhlc1xuICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5pbmRleGVzLCBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBjbHNfbWV0aG9kc1tpbmRleC5uYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHZhcmdzID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGFyZ3VtZW50cy5sZW5ndGggLSAxKSAhPT0gXy5zaXplKGluZGV4LmNvbHVtbnMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyAoJ0ludmFsaWQgbnVtYmVyIG9mIGFyZ3VtZW50cyB0byAnICsgc2NoZW1hLm1vZGVsICsgJy4nICsgaW5kZXgubmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBjcmVhdGUgdGhlIGluZGV4IHF1ZXJ5XG4gICAgICAgICAgICAgICAgICAgIHZhciBxID0gbmV3IG9yYi5RKCk7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChpbmRleC5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uLCBpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxID0gcS5hbmQobmV3IG9yYi5RKGNvbHVtbikuaXModmFyZ3NbaV0pKVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkcyA9IHNjb3BlW3NjaGVtYS5tb2RlbF0uc2VsZWN0KHt3aGVyZTogcX0pO1xuICAgICAgICAgICAgICAgICAgICB2YXIgb3B0aW9ucyA9IHZhcmdzW3ZhcmdzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVxdWVzdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4LmZsYWdzLlVuaXF1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWVzdCA9IHJlY29yZHMuZmV0Y2hPbmUob3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXF1ZXN0ID0gcmVjb3Jkcy5mZXRjaChvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVxdWVzdDtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBtb2RlbFR5cGUgPSBvcmIuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICBpZEF0dHJpYnV0ZTogc2NoZW1hLmlkQ29sdW1uLFxuICAgICAgICAgICAgICAgIHVybFJvb3Q6IHNjaGVtYS51cmxSb290LFxuICAgICAgICAgICAgICAgIGRlZmF1bHRzOiBkZWZhdWx0c1xuICAgICAgICAgICAgfSwgY2xzX21ldGhvZHMpO1xuXG4gICAgICAgICAgICBtb2RlbFR5cGUuY29sbGVjdGlvbiA9IG9yYi5Db2xsZWN0aW9uLmV4dGVuZCh7XG4gICAgICAgICAgICAgICAgbW9kZWw6IG1vZGVsVHlwZVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBtb2RlbFR5cGU7XG4gICAgICAgIH0sXG4gICAgfSk7XG59KSh3aW5kb3cub3JiLCBqUXVlcnkpOyJdfQ==
