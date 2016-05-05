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
                // ignore any read-only attributes
                var attrs = _.clone(record.attributes);
                var schema = record.constructor.schema;
                var is_new = record.isNew();
                if (schema !== undefined) {
                    _.each(schema.columns, function (column) {
                        if (column.flags.ReadOnly) {
                            delete attrs[column.field];
                            delete attrs[column.name];
                        } else if (is_new && attrs[column.field] === null) {
                            delete attrs[column.field];
                            delete attrs[column.name];
                        }
                    });
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

                            self.references[key] = new model(attribute);
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

            // process the base call
            return Backbone.Model.prototype.parse.call(this, response, options);
        },
        save: function (attrs, options) {
            options = options || {};
            var my_attrs =  _.clone(attrs || this.attributes);
            var include = options.include || '';
            var self = this;
            var expand = [];

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
                    _.each(schema.columns, function (col) {
                        if (col.name === attribute) {
                            field = col.field;
                        }
                    });

                    delete attributes[attribute];

                    if (value instanceof Backbone.Model) {
                        self.references[attribute] = value;
                        if (field) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWxsLmpzIiwic3JjL2NvbGxlY3Rpb24uanMiLCJzcmMvY29udGV4dC5qcyIsInNyYy9tb2RlbC5qcyIsInNyYy9xdWVyaWVzLmpzIiwic3JjL3NjaGVtYS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwid2luZG93Lm9yYiA9IHtcbiAgICByZWFkeTogZnVuY3Rpb24gKGFwaV9yb290LCBvcHRpb25zKSB7XG4gICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICB2YXIgc2NvcGUgPSBvcHRpb25zLnNjb3BlIHx8IHt9O1xuICAgICAgICB2YXIgcmVzcDtcbiAgICAgICAgdmFyIHVybCA9IGFwaV9yb290ICsgJz9yZXR1cm5pbmc9c2NoZW1hJztcblxuICAgICAgICAvLyBzdXBwb3J0IENPUlMgZGVmaW5pdGlvbnNcbiAgICAgICAgaWYgKG9wdGlvbnMuY3Jvc3NEb21haW4pIHtcbiAgICAgICAgICAgIHJlc3AgPSAkLmdldEpTT04oe1xuICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdHRVQnLFxuICAgICAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICBjcm9zc0RvbWFpbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICBwcm9jZXNzRGF0YTogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IG9wdGlvbnMuZXJyb3JcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdXNlIGZyb20gbG9jYWwgQVBJXG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmVzcCA9ICQuZ2V0KHVybCwge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICAgZXJyb3I6IG9wdGlvbnMuZXJyb3JcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzcC5zdWNjZXNzKGZ1bmN0aW9uIChzY2hlbWFzKSB7XG4gICAgICAgICAgICBfLmVhY2goc2NoZW1hcywgZnVuY3Rpb24gKHNjaGVtYSkge1xuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgbW9kZWxcbiAgICAgICAgICAgICAgICBzY29wZVtzY2hlbWEubW9kZWxdID0gb3JiLlNjaGVtYS5nZW5lcmF0ZU1vZGVsKHtzY2hlbWE6IHNjaGVtYSwgc2NvcGU6IHNjb3BlfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gbm90aWZ5IHRoZSBzeXN0ZW0gb24gc3VjY2Vzc1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuc3VjY2VzcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5zdWNjZXNzKHNjb3BlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufTtcblxucmVxdWlyZSgnLi9jb250ZXh0Jyk7XG5yZXF1aXJlKCcuL3NjaGVtYScpO1xucmVxdWlyZSgnLi9jb2xsZWN0aW9uJyk7XG5yZXF1aXJlKCcuL21vZGVsJyk7XG5yZXF1aXJlKCcuL3F1ZXJpZXMnKTtcbiIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLkNvbGxlY3Rpb24gPSBCYWNrYm9uZS5Db2xsZWN0aW9uLmV4dGVuZCh7XG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gICAgICAgICAgICBjb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICAgICAgICAgICAgdGhpcy51cmxSb290ID0gY29udGV4dC51cmxSb290IHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMubmFtZSA9IGNvbnRleHQubmFtZSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZSA9IGNvbnRleHQuc291cmNlIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dCA9IG5ldyBvcmIuQ29udGV4dChjb250ZXh0KTtcblxuICAgICAgICAgICAgQmFja2JvbmUuQ29sbGVjdGlvbi5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIGNvbnRleHQpO1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGU6IGZ1bmN0aW9uIChwcm9wZXJ0aWVzLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIG9wdGlvbnMudXJsID0gdGhpcy51cmwoKTtcbiAgICAgICAgICAgIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNyZWF0ZS5jYWxsKHRoaXMsIHByb3BlcnRpZXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNsb25lLmNhbGwodGhpcyk7XG4gICAgICAgICAgICBvdXQuY29udGV4dCA9IHRoaXMuY29udGV4dC5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0Lm5hbWUgPSB0aGlzLm5hbWU7XG4gICAgICAgICAgICBvdXQuc291cmNlID0gdGhpcy5zb3VyY2U7XG4gICAgICAgICAgICBvdXQudXJsUm9vdCA9IHRoaXMudXJsUm9vdDtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgY29udGV4dCA9IG5ldyBvcmIuQ29udGV4dChfLmNsb25lKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKSk7XG4gICAgICAgICAgICBjb250ZXh0Lm1lcmdlKG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGNvbnRleHQgc3BlY2lmaWMgb3B0aW9ucywgdXBkYXRlIHRoZSByb290IHF1ZXJ5XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShjb250ZXh0KSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YSA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLmRhdGEsIHtvcmJfY29udGV4dDogSlNPTi5zdHJpbmdpZnkoY29udGV4dC50b0pTT04oKSl9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjb2xsZWN0aW9uIGNvbnRleHQgY29tbWFuZHNcbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Db2xsZWN0aW9uLnByb3RvdHlwZS5mZXRjaC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaENvdW50OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBjb250ZXh0ID0gbmV3IG9yYi5Db250ZXh0KF8uZXh0ZW5kKHt9LCBfLmNsb25lKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKSwge1xuICAgICAgICAgICAgICAgIHJldHVybmluZzogJ2NvdW50J1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgY29udGV4dC5tZXJnZShvcHRpb25zKTtcblxuICAgICAgICAgICAgdmFyIHBhcmFtcyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnZ2V0JyxcbiAgICAgICAgICAgICAgICB1cmw6IHRoaXMudXJsKCksXG4gICAgICAgICAgICAgICAgZGF0YTogXy5leHRlbmQoe30sIG9wdGlvbnMuZGF0YSwge29yYl9jb250ZXh0OiBKU09OLnN0cmluZ2lmeShjb250ZXh0LnRvSlNPTigpKX0pLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3Moc2VsZiwgcmVzcG9uc2UuY291bnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gJC5hamF4KHBhcmFtcyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoT25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIHZhciBjb250ZXh0ID0gbmV3IG9yYi5Db250ZXh0KF8uZXh0ZW5kKHt9LCBfLmNsb25lKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKSwge1xuICAgICAgICAgICAgICAgIGxpbWl0OiAxXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICBjb250ZXh0Lm1lcmdlKG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB2YXIgcGFyYW1zID0gXy5leHRlbmQoe30sIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdnZXQnLFxuICAgICAgICAgICAgICAgIGxpbWl0OiAxLFxuICAgICAgICAgICAgICAgIHVybDogdGhpcy51cmwoKSxcbiAgICAgICAgICAgICAgICBkYXRhOiBfLmV4dGVuZCh7fSwgb3B0aW9ucy5kYXRhLCB7b3JiX2NvbnRleHQ6IEpTT04uc3RyaW5naWZ5KGNvbnRleHQudG9KU09OKCkpfSksXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhdHRyaWJ1dGVzID0gKHJlc3BvbnNlLmxlbmd0aCkgPyByZXNwb25zZVswXSA6IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1vZGVsID0gc2VsZi5tb2RlbCB8fCBCYWtjYm9uZS5Nb2RlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2VzcyhuZXcgbW9kZWwoYXR0cmlidXRlcyksIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiAkLmFqYXgocGFyYW1zKTtcbiAgICAgICAgfSxcbiAgICAgICAgcGFyc2U6IGZ1bmN0aW9uIChyZXNwb25zZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHJlc3BvbnNlIGluc3RhbmNlb2YgQXJyYXkgfHwgcmVzcG9uc2UgaW5zdGFuY2VvZiBCYWNrYm9uZS5Db2xsZWN0aW9uIHx8IHJlc3BvbnNlIGluc3RhbmNlb2YgQmFja2JvbmUuTW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3BvbnNlLnJlY29yZHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5yZWNvcmRzO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVjb3JkcyA9IFtdO1xuICAgICAgICAgICAgICAgIHZhciBtb2RlbF90eXBlID0gdGhpcy5jb25zdHJ1Y3Rvci5tb2RlbCB8fCBCYWNrYm9uZS5Nb2RlbDtcblxuICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5jb3VudCB8fCByZXNwb25zZS5pZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHVzZV91bmRlZmluZWQgPSByZXNwb25zZS5pZHMgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvdW50ID0gcmVzcG9uc2UuY291bnQgfHwgcmVzcG9uc2UuaWRzLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkcyA9IF8udGltZXMoY291bnQsIGZ1bmN0aW9uIChuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHVzZV91bmRlZmluZWQpID8gdW5kZWZpbmVkIDoge2lkOiByZXNwb25zZS5pZHNbbl19XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5maXJzdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzWzBdID0gbmV3IG1vZGVsX3R5cGUocmVzcG9uc2UuZmlyc3QpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5sYXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHNbcmVjb3Jkcy5sZW5ndGggLSAxXSA9IG5ldyBtb2RlbF90eXBlKHJlc3BvbnNlLmxhc3QpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLmZpcnN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChuZXcgbW9kZWxfdHlwZShyZXNwb25zZS5maXJzdCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5sYXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChuZXcgbW9kZWxfdHlwZShyZXNwb25zZS5sYXN0KSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVmaW5lOiBmdW5jdGlvbiAoY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKGNvbnRleHQpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IFtdO1xuXG4gICAgICAgICAgICBzZWxmLmVhY2goZnVuY3Rpb24gKHJlY29yZCkge1xuICAgICAgICAgICAgICAgIC8vIGlnbm9yZSBhbnkgcmVhZC1vbmx5IGF0dHJpYnV0ZXNcbiAgICAgICAgICAgICAgICB2YXIgYXR0cnMgPSBfLmNsb25lKHJlY29yZC5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgICAgICB2YXIgc2NoZW1hID0gcmVjb3JkLmNvbnN0cnVjdG9yLnNjaGVtYTtcbiAgICAgICAgICAgICAgICB2YXIgaXNfbmV3ID0gcmVjb3JkLmlzTmV3KCk7XG4gICAgICAgICAgICAgICAgaWYgKHNjaGVtYSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi5mbGFncy5SZWFkT25seSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBhdHRyc1tjb2x1bW4uZmllbGRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBhdHRyc1tjb2x1bW4ubmFtZV07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzX25ldyAmJiBhdHRyc1tjb2x1bW4uZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGF0dHJzW2NvbHVtbi5maWVsZF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGF0dHJzW2NvbHVtbi5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChhdHRycyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgIH0sXG4gICAgICAgIHNhdmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgdXJsID0gdGhpcy51cmwoKTtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gdGhpcy50b0pTT04oKTtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgICAgICByZXR1cm4gJC5hamF4KF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3B1dCcsXG4gICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgZGF0YTogSlNPTi5zdHJpbmdpZnkoe3JlY29yZHM6IHJlY29yZHN9KSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgdGhlIHJlc3VsdCByZWNvcmRzXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZWFjaChmdW5jdGlvbiAobW9kZWwsIGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsLnNldChtb2RlbC5wYXJzZShyZXN1bHRzW2ldKSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2VzcyhzZWxmLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zb3VyY2UgJiYgdGhpcy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvb3QgPSB0aGlzLnNvdXJjZS51cmxSb290O1xuXG4gICAgICAgICAgICAgICAgaWYgKHJvb3QpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZF9pZCA9IHRoaXMuc291cmNlLmdldCgnaWQnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZF9pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRyaW1tZWQgPSBzLnRyaW0ocm9vdCwgJy8nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBbdHJpbW1lZCwgcmVjb3JkX2lkLCB0aGlzLm5hbWVdLmpvaW4oJy8nKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByb290O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudXJsUm9vdDtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiLCIoZnVuY3Rpb24gKG9yYikge1xuICAgIHZhciBEZWZhdWx0cyA9IHtcbiAgICAgICAgJ2F1dG9JbmNyZW1lbnRFbmFibGVkJzogdHJ1ZSxcbiAgICAgICAgJ2NvbHVtbnMnOiB1bmRlZmluZWQsXG4gICAgICAgICdkYic6IHVuZGVmaW5lZCxcbiAgICAgICAgJ2RhdGFiYXNlJzogdW5kZWZpbmVkLFxuICAgICAgICAnZGlzdGluY3QnOiBmYWxzZSxcbiAgICAgICAgJ2Rpc2luY3RPbic6ICcnLFxuICAgICAgICAnZHJ5UnVuJzogZmFsc2UsXG4gICAgICAgICdleHBhbmQnOiB1bmRlZmluZWQsXG4gICAgICAgICdmb3JtYXQnOiAnanNvbicsXG4gICAgICAgICdmb3JjZSc6IGZhbHNlLFxuICAgICAgICAnaW5mbGF0ZWQnOiB0cnVlLFxuICAgICAgICAnbGltaXQnOiB1bmRlZmluZWQsXG4gICAgICAgICdsb2NhbGUnOiB1bmRlZmluZWQsXG4gICAgICAgICduYW1lc3BhY2UnOiAnJyxcbiAgICAgICAgJ29yZGVyJzogdW5kZWZpbmVkLFxuICAgICAgICAncGFnZSc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3BhZ2VTaXplJzogdW5kZWZpbmVkLFxuICAgICAgICAnc2NvcGUnOiB1bmRlZmluZWQsXG4gICAgICAgICdyZXR1cm5pbmcnOiAncmVjb3JkcycsXG4gICAgICAgICdzdGFydCc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3RpbWV6b25lJzogdW5kZWZpbmVkLFxuICAgICAgICAnd2hlcmUnOiB1bmRlZmluZWRcbiAgICB9O1xuICAgIFxuICAgIG9yYi5Db250ZXh0ID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgY2xvbmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuY2xvbmUuY2FsbCh0aGlzKTtcblxuICAgICAgICAgICAgLy8gZW5zdXJlIHdlIGRvIGEgZGVlcCBjb3B5XG4gICAgICAgICAgICBpZiAob3V0LmF0dHJpYnV0ZXMuY29sdW1ucyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3V0LmF0dHJpYnV0ZXMuY29sdW1ucyA9IG91dC5hdHRyaWJ1dGVzLmNvbHVtbnMuc2xpY2UoMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvdXQuYXR0cmlidXRlcy5vcmRlciAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBvdXQuYXR0cmlidXRlcy5vcmRlciA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBvdXQuYXR0cmlidXRlcy5vcmRlciA9IG91dC5hdHRyaWJ1dGVzLm9yZGVyLnNsaWNlKDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob3V0LmF0dHJpYnV0ZXMud2hlcmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG91dC5hdHRyaWJ1dGVzLndoZXJlID0gb3V0LmF0dHJpYnV0ZXMud2hlcmUuY2xvbmUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbWVyZ2U6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgXy5lYWNoKG90aGVyLCBmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09ICd3aGVyZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHdoZXJlID0gc2VsZi5nZXQoJ3doZXJlJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh3aGVyZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2hlcmUgPSB3aGVyZS5hbmQodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2hlcmUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZWxmLnNldCgnd2hlcmUnLCB3aGVyZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGtleSA9PT0gJ2V4cGFuZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGV4cGFuZCA9IHNlbGYuZ2V0KCdleHBhbmQnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4cGFuZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXhwYW5kLmV4dGVuZCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnNldCgnZXhwYW5kJywgdmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLnNldChrZXksIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIGRhdGE7XG4gICAgICAgICAgICBpZiAoIV8uaXNPYmplY3Qoa2V5KSkge1xuICAgICAgICAgICAgICAgIGRhdGEgPSB7fTtcbiAgICAgICAgICAgICAgICBkYXRhW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IGtleTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHZhbHVlcyA9IHt9O1xuICAgICAgICAgICAgXy5lYWNoKGRhdGEsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGsgPT09ICdleHBhbmQnICYmIHR5cGVvZiB2ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdi5zcGxpdCgnLCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChfLmtleXMoRGVmYXVsdHMpLmluZGV4T2YoaykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlc1trXSA9IHY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5zZXQuY2FsbCh0aGlzLCB2YWx1ZXMpO1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSBfLmNsb25lKHRoaXMuYXR0cmlidXRlcyk7XG4gICAgICAgICAgICBpZiAob3V0LndoZXJlKSB7XG4gICAgICAgICAgICAgICAgb3V0LndoZXJlID0gb3V0LndoZXJlLnRvSlNPTigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuTW9kZWwgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IHNlbGYuY29uc3RydWN0b3Iuc2NoZW1hO1xuXG4gICAgICAgICAgICAvLyBpbml0aWFsaXplIGluZm9ybWF0aW9uIGZyb20gdGhlIHNjaGVtYVxuICAgICAgICAgICAgaWYgKCFzZWxmLl9pbml0aWFsaXplZCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2luaXRpYWxpemVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlcyA9IHt9O1xuICAgICAgICAgICAgICAgIHNlbGYuY29sbGVjdGlvbnMgPSB7fTtcblxuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSByZWZlcmVuY2UgaW5mb3JtYXRpb25cbiAgICAgICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi50eXBlID09PSAnUmVmZXJlbmNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sbGVjdG9ycywgZnVuY3Rpb24gKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xsZWN0b3IuZmxhZ3MuU3RhdGljKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5VbmlxdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbW9kZWwgPSBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sbGVjdG9yLm1vZGVsXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZHM7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXNlIGRlZmF1bHQgbW9kZWxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzID0gbmV3IG1vZGVsLmNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMuc291cmNlID0gc2VsZjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMubmFtZSA9IGNvbGxlY3Rvci5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5tb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbT1JCIEVycm9yXSBDb3VsZCBub3QgZmluZCBtb2RlbDogJyArIGNvbGxlY3Rvci5tb2RlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3Jkcy51cmwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtzLnRyaW0oc2VsZi51cmxSb290LCAnLycpLCBzZWxmLmdldCgnaWQnKSwgY29sbGVjdG9yLm5hbWVdLmpvaW4oJy8nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmNvbGxlY3Rpb25zW2NvbGxlY3Rvci5uYW1lXSA9IHJlY29yZHM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGZbY29sbGVjdG9yLm5hbWVdID0gcmVjb3JkcztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gdXBkYXRlIGFueSByZWZlcmVuY2Ugb3IgY29sbGVjdG9yIGF0dHJpYnV0ZXMgaGVyZVxuICAgICAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgICAgICAgIF8uZWFjaChzZWxmLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyaWJ1dGUsIGtleSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoXy5oYXMoc2VsZi5yZWZlcmVuY2VzLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgc2VsZi5hdHRyaWJ1dGVzW2tleV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5yZWZlcmVuY2VzW2tleV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtb2RlbCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi5uYW1lID09PSBrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsID0gc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbHVtbi5yZWZlcmVuY2VdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobW9kZWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnW09SQiBFcnJvcl0gQ291bGQgbm90IGZpbmQgbW9kZWwgZm9yOiAnICsgc2NoZW1hLm1vZGVsICsgJy4nICsga2V5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWwgPSBCYWNrYm9uZS5Nb2RlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNba2V5XSA9IG5ldyBtb2RlbChhdHRyaWJ1dGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNba2V5XS5zZXQoYXR0cmlidXRlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChfLmhhcyhzZWxmLmNvbGxlY3Rpb25zLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgc2VsZi5hdHRyaWJ1dGVzW2tleV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlIGluc3RhbmNlb2YgQmFja2JvbmUuQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuY29sbGVjdGlvbnNba2V5XSA9IGF0dHJpYnV0ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLmNvbGxlY3Rpb25zW2tleV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbi5zZXQoY29sbGVjdGlvbi5wYXJzZShhdHRyaWJ1dGUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIC8vIGNhbGwgdGhlIGJhc2UgY2xhc3MncyBtZXRob2RcbiAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgY29udGV4dCA9IG5ldyBvcmIuQ29udGV4dCgpO1xuICAgICAgICAgICAgY29udGV4dC5tZXJnZShvcHRpb25zKTtcblxuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBjb250ZXh0IHNwZWNpZmljIG9wdGlvbnMsIHVwZGF0ZSB0aGUgcm9vdCBxdWVyeVxuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkoY29udGV4dCkpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSBfLmV4dGVuZCh7fSwgb3B0aW9ucy5kYXRhLCB7b3JiX2NvbnRleHQ6IEpTT04uc3RyaW5naWZ5KGNvbnRleHQudG9KU09OKCkpfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5mZXRjaC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcbiAgICAgICAgICAgIHZhciBwYXJ0cyA9IGF0dHJpYnV0ZS5zcGxpdCgnLicpO1xuICAgICAgICAgICAgYXR0cmlidXRlID0gcGFydHNbMF07XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gdGhpcy5jb25zdHJ1Y3Rvci5zY2hlbWE7XG4gICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbGxlY3RvciA9IHNjaGVtYS5jb2xsZWN0b3JzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgdmFyIGNvbHVtbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB2YXIgcmVjb3JkID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sLnR5cGUgPT09ICdSZWZlcmVuY2UnICYmIGNvbC5uYW1lID09PSBhdHRyaWJ1dGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbiA9IGNvbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8gZ2V0IGEgcmVmZXJlbmNlIGNvbHVtblxuICAgICAgICAgICAgICAgIGlmIChjb2x1bW4gJiYgY29sdW1uLnR5cGUgPT09ICdSZWZlcmVuY2UnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZCA9IHRoaXMucmVmZXJlbmNlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVjb3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmRfaWQgPSBzZWxmLmF0dHJpYnV0ZXNbY29sdW1uLmZpZWxkXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWNvcmRfaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNvcmQgPSBuZXcgc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbHVtbi5yZWZlcmVuY2VdKHtpZDogc2VsZi5hdHRyaWJ1dGVzW2NvbHVtbi5maWVsZF19KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlZmVyZW5jZXNbY29sdW1uLm5hbWVdID0gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEgJiYgcmVjb3JkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQuZ2V0KHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gZ2V0IGEgY29sbGVjdGlvbiBvZiBvYmplY3RzXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoY29sbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0b3IuZmxhZ3MuVW5pcXVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmQgPSB0aGlzLnJlZmVyZW5jZXNbYXR0cmlidXRlXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWNvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZCA9IG5ldyBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sbGVjdG9yLm1vZGVsXSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZC51cmxSb290ID0gdGhpcy51cmwoKSArICcvJyArIG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZWZlcmVuY2VzW2F0dHJpYnV0ZV0gPSByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbnNbYXR0cmlidXRlXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGdldCBhIHJlZ3VsYXIgYXR0cmlidXRlXG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuZ2V0LmNhbGwodGhpcywgYXR0cmlidXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGdldCBhIHJlZ3VsYXIgYXR0cmlidXRlXG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLmdldC5jYWxsKHRoaXMsIGF0dHJpYnV0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHBhcnNlOiBmdW5jdGlvbiAocmVzcG9uc2UsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnJlZmVyZW5jZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gc2VsZi5jb25zdHJ1Y3Rvci5zY2hlbWE7XG5cbiAgICAgICAgICAgIGlmIChzY2hlbWEgJiYgcmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAvLyBsb2FkIHJlZmVyZW5jZXNcbiAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi50eXBlID09PSAnUmVmZXJlbmNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGRhdGEgPSByZXNwb25zZVtjb2x1bW4ubmFtZV07XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgcmVzcG9uc2VbY29sdW1uLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2VsZi5yZWZlcmVuY2VzW2NvbHVtbi5uYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbY29sdW1uLm5hbWVdID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2x1bW4ucmVmZXJlbmNlXShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbY29sdW1uLm5hbWVdLnNldChkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIGxvYWQgY29sbGVjdG9yc1xuICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sbGVjdG9ycywgZnVuY3Rpb24gKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IHJlc3BvbnNlW2NvbGxlY3Rvci5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHJlc3BvbnNlW2NvbGxlY3Rvci5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0b3IuZmxhZ3MuVW5pcXVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWxmLnJlZmVyZW5jZXNbY29sbGVjdG9yLm5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2xsZWN0b3IubmFtZV0gPSBuZXcgc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbGxlY3Rvci5tb2RlbF0oZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXS5zZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29sbGVjdGlvbiA9IHNlbGYuY29sbGVjdGlvbnNbY29sbGVjdG9yLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxlY3Rpb24uc2V0KGNvbGxlY3Rpb24ucGFyc2UoZGF0YSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHByb2Nlc3MgdGhlIGJhc2UgY2FsbFxuICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5wYXJzZS5jYWxsKHRoaXMsIHJlc3BvbnNlLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2F2ZTogZnVuY3Rpb24gKGF0dHJzLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBteV9hdHRycyA9ICBfLmNsb25lKGF0dHJzIHx8IHRoaXMuYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB2YXIgaW5jbHVkZSA9IG9wdGlvbnMuaW5jbHVkZSB8fCAnJztcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBleHBhbmQgPSBbXTtcblxuICAgICAgICAgICAgLy8gaW5jbHVkZSBhbnkgY29sbGVjdG9yIGluZm9ybWF0aW9uIGhlcmVcbiAgICAgICAgICAgIF8uZWFjaChpbmNsdWRlLnNwbGl0KCcsJyksIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLmNvbGxlY3Rpb25zW25hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgbXlfYXR0cnNbbmFtZV0gPSBjb2xsZWN0aW9uLnRvSlNPTigpO1xuICAgICAgICAgICAgICAgICAgICBleHBhbmQucHVzaChuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gaWdub3JlIGFueSByZWFkLW9ubHkgYXR0cmlidXRlc1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IHNlbGYuY29uc3RydWN0b3Iuc2NoZW1hO1xuICAgICAgICAgICAgdmFyIGlzX25ldyA9IHNlbGYuaXNOZXcoKTtcbiAgICAgICAgICAgIGlmIChzY2hlbWEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sdW1uLmZsYWdzLlJlYWRPbmx5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgbXlfYXR0cnNbY29sdW1uLmZpZWxkXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBteV9hdHRyc1tjb2x1bW4ubmFtZV07XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNfbmV3ICYmIG15X2F0dHJzW2NvbHVtbi5maWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBteV9hdHRyc1tjb2x1bW4uZmllbGRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIG15X2F0dHJzW2NvbHVtbi5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZXhwYW5kLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIG15X2F0dHJzLm9yYl9jb250ZXh0ID0ge2V4cGFuZDogZXhwYW5kLmpvaW4oJywnKX07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcHRpb25zLmRhdGEgPSBKU09OLnN0cmluZ2lmeShteV9hdHRycyk7XG5cbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuc2F2ZS5jYWxsKHRoaXMsIGF0dHJzLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAoYXR0cmlidXRlcywgb3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgYXR0cmlidXRlcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X2F0dHJpYiA9IHt9O1xuICAgICAgICAgICAgICAgIG5ld19hdHRyaWJbYXR0cmlidXRlc10gPSBvcHRpb25zO1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXMgPSBuZXdfYXR0cmliO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gdGhpcy5jb25zdHJ1Y3Rvci5zY2hlbWE7XG4gICAgICAgICAgICBfLmVhY2goYXR0cmlidXRlcywgZnVuY3Rpb24gKHZhbHVlLCBhdHRyaWJ1dGUpIHtcbiAgICAgICAgICAgICAgICAvLyBzZXQgcmVmZXJlbmNlIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgaWYgKF8uaGFzKHNlbGYucmVmZXJlbmNlcywgYXR0cmlidXRlKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZmllbGQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbC5uYW1lID09PSBhdHRyaWJ1dGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWVsZCA9IGNvbC5maWVsZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGF0dHJpYnV0ZXNbYXR0cmlidXRlXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBCYWNrYm9uZS5Nb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2F0dHJpYnV0ZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWVsZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXNbZmllbGRdID0gdmFsdWUuaWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgc2VsZi5yZWZlcmVuY2VzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZmllbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzW2ZpZWxkXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gc2V0IGNvbGxlY3Rpb24gaW5mb3JtYXRpb25cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChfLmhhcyhzZWxmLmNvbGxlY3Rpb25zLCBhdHRyaWJ1dGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEJhY2tib25lLkNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuY29sbGVjdGlvbnNbYXR0cmlidXRlXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLmNvbGxlY3Rpb25zW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uLnNldChjb2xsZWN0aW9uLnBhcnNlKHZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5zZXQuY2FsbCh0aGlzLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfSxcbiAgICAgICAgdW5zZXQ6IGZ1bmN0aW9uIChhdHRyaWJ1dGUsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIC8vIHVuc2V0IGEgcmVmZXJlbmNlIG9iamVjdFxuICAgICAgICAgICAgaWYgKHRoaXMucmVmZXJlbmNlc1tuYW1lXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSB0aGlzLnJlZmVyZW5jZXNbbmFtZV07XG4gICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMucmVmZXJlbmNlc1tuYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoIW9wdGlvbnMuc2lsZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcignY2hhbmdlOicgKyBuYW1lLCBkYXRhKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHVuc2V0IGEgY29sbGVjdGlvblxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcy5jb2xsZWN0aW9uc1thdHRyaWJ1dGVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3Rpb25zW2F0dHJpYnV0ZV0ucmVzZXQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdW5zZXQgYW4gYXR0cmlidXRlXG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnVuc2V0LmNhbGwodGhpcywgYXR0cmlidXRlLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdmFyIGlkID0gdGhpcy5nZXQoJ2lkJyk7XG4gICAgICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb24udXJsKCkgKyAnLycgKyBpZDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLnVybCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS51cmwuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgc2NoZW1hOiB1bmRlZmluZWQsXG4gICAgICAgIGNvbGxlY3Rpb246IG9yYi5Db2xsZWN0aW9uLFxuICAgICAgICBhbGw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Qob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdDogZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gbmV3IHRoaXMuY29sbGVjdGlvbihjb250ZXh0KTtcbiAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IHRoaXMucHJvdG90eXBlLnVybFJvb3Q7XG4gICAgICAgICAgICByZWNvcmRzLm1vZGVsID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzO1xuICAgICAgICB9LFxuICAgICAgICBieUlkOiBmdW5jdGlvbiAoaWQsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIGNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuICAgICAgICAgICAgdmFyIHEgPSBuZXcgb3JiLlEoJ2lkJykuaXMoaWQpO1xuICAgICAgICAgICAgY29udGV4dC53aGVyZSA9IHEuYW5kKGNvbnRleHQud2hlcmUpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KCkuZmV0Y2hPbmUoY29udGV4dCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpO1xuIiwiKGZ1bmN0aW9uIChvcmIpIHtcbiAgICAvLyBkZWZpbmUgdGhlIGJhc2UgcXVlcnkgdHlwZVxuICAgIG9yYi5RID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG9wOiAnPT0nLFxuICAgICAgICAgICAgY29sdW1uOiB1bmRlZmluZWQsXG4gICAgICAgICAgICB0YWJsZTogJycsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiBmYWxzZSxcbiAgICAgICAgICAgIGZ1bmN0aW9uczogdW5kZWZpbmVkLFxuICAgICAgICAgICAgbWF0aDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgaW52ZXJ0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgdmFsdWU6IHVuZGVmaW5lZFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZihvcHRpb25zKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnY29sdW1uJywgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ2Z1bmN0aW9ucycpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnZnVuY3Rpb25zJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KCdtYXRoJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdtYXRoJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhZnRlcjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5BZnRlcik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGFiczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5BYnMpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5BbmQsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYXNTdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KG9yYi5RLk9wLkFzU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJlZm9yZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5CZWZvcmUpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBiZXR3ZWVuOiBmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmV0d2Vlbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIFthLCBiXSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjb250YWluczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQ29udGFpbnMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGF0dHJzID0gXy5leHRlbmQoe30sIHRoaXMuYXR0cmlidXRlcyk7XG4gICAgICAgICAgICBhdHRyc1snZnVuY3Rpb25zJ10gPSBhdHRyc1snZnVuY3Rpb25zJ10uc2xpY2UoMCk7XG4gICAgICAgICAgICBhdHRyc1snbWF0aCddID0gYXR0cnNbJ21hdGgnXS5zbGljZSgwKTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlEoYXR0cnMpO1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90Q29udGFpbjogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdENvbnRhaW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90RW5kd2l0aDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90RW5kd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RNYXRjaDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdE1hdGNoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdFN0YXJ0d2l0aDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90U3RhcnR3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZW5kc3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRW5kc3dpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBncmVhdGVyVGhhbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuT3JFcXVhbDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpczogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jcyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTm90OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90KTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMuZ2V0KCdjb2x1bW4nKSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQpO1xuICAgICAgICB9LFxuICAgICAgICBpc1VuZGVmaW5lZDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzSW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBub3RJbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc05vdEluKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbGVzc1RoYW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW5PckVxdWFsKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbG93ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVuY3Rpb24uTG93ZXIpO1xuICAgICAgICB9LFxuICAgICAgICBtYXRjaGVzOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyB0cnVlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLk1hdGNoZXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBtb2RpZnk6IGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICB0aGlzLmdldCgnZnVuY3Rpb25zJykucHVzaChmdW5jKTtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLk9yLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXJ0c3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuU3RhcnRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3F1ZXJ5JyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0KCdjb2x1bW4nKSxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdGhpcy5nZXQoJ3ZhbHVlJylcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBmdW5jcyA9IHRoaXMuZ2V0KCdmdW5jdGlvbnMnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGZ1bmNzKSkge1xuICAgICAgICAgICAgICAgIHZhciBqZnVuY3MgPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2goZnVuY3MsIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIGpmdW5jcy5wdXNoKG9yYi5RLkZ1bmN0aW9uLmtleShmdW5jKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5mdW5jdGlvbnMgPSBqZnVuY3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXRoID0gdGhpcy5nZXQoJ21hdGgnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KG1hdGgpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGptYXRoID0gW107XG4gICAgICAgICAgICAgICAgXy5lYWNoKG1hdGgsIGZ1bmN0aW9uIChvcCkge1xuICAgICAgICAgICAgICAgICAgICBqbWF0aC5wdXNoKG9yYi5RLk1hdGgua2V5KG9wKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5tYXRoID0gam1hdGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgICB9LFxuICAgICAgICB1cHBlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW50aW9ucy5VcHBlcik7XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIE9wOiB7XG4gICAgICAgICAgICBJczogJz09JyxcbiAgICAgICAgICAgIElzTm90OiAnIT0nLFxuICAgICAgICAgICAgTGVzc1RoYW46ICc8JyxcbiAgICAgICAgICAgIExlc3NUaGFuT3JFcXVhbDogJzw9JyxcbiAgICAgICAgICAgIEJlZm9yZTogJzwnLFxuICAgICAgICAgICAgR3JlYXRlclRoYW46ICc+JyxcbiAgICAgICAgICAgIEdyZWF0ZXJUaGFuT3JFcXVhbDogJz49JyxcbiAgICAgICAgICAgIEFmdGVyOiAnPicsXG4gICAgICAgICAgICBCZXR3ZWVuOiAnYmV0d2VlbicsXG4gICAgICAgICAgICBDb250YWluczogJ2NvbnRhaW5zJyxcbiAgICAgICAgICAgIERvZXNOb3RDb250YWluOiBcImRvZXNuJ3QgY29udGFpblwiLFxuICAgICAgICAgICAgU3RhcnRzd2l0aDogJ3N0YXJ0c3dpdGgnLFxuICAgICAgICAgICAgRW5kc3dpdGg6ICdlbmRzd2l0aCcsXG4gICAgICAgICAgICBNYXRjaGVzOiAnbWF0Y2hlcycsXG4gICAgICAgICAgICBEb2VzTm90TWF0Y2g6IFwiZG9lc24ndCBtYXRjaFwiLFxuICAgICAgICAgICAgSXNJbjogJ2lzIGluJyxcbiAgICAgICAgICAgIElzTm90SW46ICdpcyBub3QgaW4nLFxuICAgICAgICAgICAgRG9lc05vdFN0YXJ0d2l0aDogXCJkb2Vzbid0IHN0YXJ0d2l0aFwiLFxuICAgICAgICAgICAgRG9lc05vdEVuZHdpdGg6IFwiZG9lc24ndCBlbmR3aXRoXCIsXG4gICAgICAgICAgICBBbmQ6ICdhbmQnLFxuICAgICAgICAgICAgT3I6ICdvcicsXG5cbiAgICAgICAgICAgIGtleTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmZpbmQodGhpcywgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4ga2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBNYXRoOiB7XG4gICAgICAgICAgICBBZGQ6ICcrJyxcbiAgICAgICAgICAgIFN1YnRyYWN0OiAnLScsXG4gICAgICAgICAgICBNdWx0aXBseTogJyonLFxuICAgICAgICAgICAgRGl2aWRlOiAnLycsXG4gICAgICAgICAgICBBbmQ6ICcmJyxcbiAgICAgICAgICAgIE9yOiAnfCcsXG5cbiAgICAgICAgICAgIGtleTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmZpbmQodGhpcywgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4ga2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBGdW5jdGlvbjoge1xuICAgICAgICAgICAgTG93ZXI6ICdsb3dlcicsXG4gICAgICAgICAgICBVcHBlcjogJ3VwcGVyJyxcbiAgICAgICAgICAgIEFiczogJ2FicycsXG4gICAgICAgICAgICBBc1N0cmluZzogJ3N0cicsXG5cbiAgICAgICAgICAgIGtleTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmZpbmQodGhpcywgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4ga2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvcmIuUUNvbXBvdW5kID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG9wOiAnYW5kJ1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgc3ViX3EgPSBvcHRpb25zLnF1ZXJpZXM7XG4gICAgICAgICAgICB0aGlzLnF1ZXJpZXMgPSAoc3ViX3EgaW5zdGFuY2VvZiBCYWNrYm9uZS5Db2xsZWN0aW9uKSA/IHN1Yl9xIDogbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oc3ViX3EpO1xuICAgICAgICB9LFxuICAgICAgICBhbmQ6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLkFuZCkge1xuICAgICAgICAgICAgICAgIHZhciBuZXdfcXVlcmllcyA9IHRoaXMucXVlcmllcy5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICBuZXdfcXVlcmllcy5wdXNoKG90aGVyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLkFuZCwgcXVlcmllczogbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oW3RoaXMsIG90aGVyXSl9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY2xvbmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIG9wOiB0aGlzLmdldCgnb3AnKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiB0aGlzLnF1ZXJpZXMuY2xvbmUoKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZChvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYW1fbnVsbCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnF1ZXJpZXMuZWFjaChmdW5jdGlvbiAoc3VicXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN1YnF1ZXJ5LmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtX251bGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBhbV9udWxsO1xuICAgICAgICB9LFxuICAgICAgICBvcjogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdldCgnb3AnKSA9PT0gb3JiLlEuT3AuT3IpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLnF1ZXJpZXMuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuT3IsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBbdGhpcywgb3RoZXJdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY29tcG91bmQnLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHRoaXMucXVlcmllcy50b0pTT04oKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuSW5kZXggPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICBkYm5hbWU6ICcnLFxuICAgICAgICAgICAgdW5pcXVlOiBmYWxzZSxcbiAgICAgICAgICAgIG9yZGVyOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBjYWNoZWQ6IGZhbHNlLFxuICAgICAgICAgICAgdGltZW91dDogMFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgQ29sdW1ucyA9IEJhY2tib25lLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICBtb2RlbDogb3JiLkNvbHVtblxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IG5ldyBDb2x1bW5zKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdldCgnbmFtZScpLFxuICAgICAgICAgICAgICAgIGRibmFtZTogdGhpcy5nZXQoJ2RibmFtZScpLFxuICAgICAgICAgICAgICAgIHVuaXF1ZTogdGhpcy5nZXQoJ3VuaXF1ZScpLFxuICAgICAgICAgICAgICAgIG9yZGVyOiB0aGlzLmdldCgnb3JkZXInKSxcbiAgICAgICAgICAgICAgICBjYWNoZWQ6IHRoaXMuZ2V0KCdjYWNoZWQnKSxcbiAgICAgICAgICAgICAgICB0aW1lb3V0OiB0aGlzLmdldCgndGltZW91dCcpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5QaXBlID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgdGhyb3VnaDogJycsXG4gICAgICAgICAgICBmcm9tOiAnJyxcbiAgICAgICAgICAgIHRvOiAnJyxcbiAgICAgICAgICAgIHVuaXF1ZTogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgdGhyb3VnaDogdGhpcy5nZXQoJ3Rocm91Z2gnKSxcbiAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmdldCgnZnJvbScpLFxuICAgICAgICAgICAgICAgIHRvOiB0aGlzLmdldCgndG8nKSxcbiAgICAgICAgICAgICAgICB1bmlxdWU6IHRoaXMuZ2V0KCd1bmlxdWUnKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLkNvbHVtbiA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZmllbGQ6ICcnLFxuICAgICAgICAgICAgZGlzcGxheTogJycsXG4gICAgICAgICAgICByZWZlcmVuY2U6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGluZGV4OiB1bmRlZmluZWQsXG4gICAgICAgICAgICBmbGFnczogMCxcbiAgICAgICAgICAgIGRlZmF1bHQ6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogJ2FzYydcbiAgICAgICAgfSxcbiAgICAgICAgdGVzdEZsYWc6IGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgICAgICByZXR1cm4gKHNlbGYuZ2V0KCdmbGFncycpICYgZmxhZykgPiAwO1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMuZ2V0KCdpbmRleCcpO1xuICAgICAgICAgICAgdmFyIGluZGV4X2pzb24gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleF9qc29uID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBpbmRleC5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVkOiBpbmRleC5nZXQoJ2NhY2hlZCcpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiBpbmRleC5nZXQoJ3RpbWVvdXQnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiB0aGlzLmdldCgndHlwZScpLFxuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgZmllbGQ6IHRoaXMuZ2V0KCdmaWVsZCcpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgZmxhZ3M6IHRoaXMuZ2V0KCdmbGFncycpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogdGhpcy5nZXQoJ2RlZmF1bHRPcmRlcicpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHRoaXMuZ2V0KCdkZWZhdWx0JyksXG4gICAgICAgICAgICAgICAgaW5kZXg6IGluZGV4X2pzb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5TY2hlbWEgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICBhYnN0cmFjdDogZmFsc2UsXG4gICAgICAgICAgICBkYm5hbWU6ICcnLFxuICAgICAgICAgICAgZGlzcGxheTogJycsXG4gICAgICAgICAgICBpbmhlcml0czogJycsXG4gICAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICAgIGlkQ29sdW1uOiAnaWQnXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMuY29tcGFyYXRvciA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoJ25hbWUnKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5pbmRleGVzID0gbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMuaW5kZXhlcy5jb21wYXJhdG9yID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgnbmFtZScpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5waXBlcyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnBpcGVzLmNvbXBhcmF0b3IgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbW9kZWwuZ2V0KCduYW1lJyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdGhpcy5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICBhYnN0cmFjdDogdGhpcy5nZXQoJ2Fic3RyYWN0JyksXG4gICAgICAgICAgICAgICAgZGJuYW1lOiB0aGlzLmdldCgnZGJuYW1lJyksXG4gICAgICAgICAgICAgICAgZGlzcGxheTogdGhpcy5nZXQoJ2Rpc3BsYXknKSxcbiAgICAgICAgICAgICAgICBpbmhlcml0czogdGhpcy5nZXQoJ2luaGVyaXRzJyksXG4gICAgICAgICAgICAgICAgY29sdW1uczogdGhpcy5jb2x1bW5zLnRvSlNPTigpLFxuICAgICAgICAgICAgICAgIGluZGV4ZXM6IHRoaXMuaW5kZXhlcy50b0pTT04oKSxcbiAgICAgICAgICAgICAgICBwaXBlczogdGhpcy5waXBlcy50b0pTT04oKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgZ2VuZXJhdGVNb2RlbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IG9wdGlvbnMuc2NoZW1hO1xuICAgICAgICAgICAgdmFyIHNjb3BlID0gb3B0aW9ucy5zY29wZSB8fCB7fTtcbiAgICAgICAgICAgIHZhciBkZWZhdWx0cyA9IHt9O1xuXG4gICAgICAgICAgICBzY2hlbWEucmVmZXJlbmNlU2NvcGUgPSBzY29wZTtcblxuICAgICAgICAgICAgdmFyIGNsc19tZXRob2RzID0ge3NjaGVtYTogc2NoZW1hfTtcblxuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSBkZWZhdWx0IHZhbHVlc1xuICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uLCBmaWVsZCkge1xuICAgICAgICAgICAgICAgIGlmIChjb2x1bW4udHlwZSAhPT0gJ0lkJykge1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0c1tmaWVsZF0gPSBjb2x1bW5bJ2RlZmF1bHQnXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gbG9hZCBjb2xsZWN0b3JzXG4gICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbGxlY3RvcnMsIGZ1bmN0aW9uIChjb2xsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sbGVjdG9yLmZsYWdzLlN0YXRpYykge1xuICAgICAgICAgICAgICAgICAgICBjbHNfbWV0aG9kc1tjb2xsZWN0b3IubmFtZV0gPSBmdW5jdGlvbiAoY29udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdG9yLm1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkcyA9IG5ldyBzY29wZVtjb2xsZWN0b3IubW9kZWxdLmNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkcyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzLnVybCA9IHNjaGVtYS51cmxSb290ICsgJy8nICsgY29sbGVjdG9yLm5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gbG9hZCBpbmRleGVzXG4gICAgICAgICAgICBfLmVhY2goc2NoZW1hLmluZGV4ZXMsIGZ1bmN0aW9uIChpbmRleCkge1xuICAgICAgICAgICAgICAgIGNsc19tZXRob2RzW2luZGV4Lm5hbWVdID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdmFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoYXJndW1lbnRzLmxlbmd0aCAtIDEpICE9PSBfLnNpemUoaW5kZXguY29sdW1ucykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93ICgnSW52YWxpZCBudW1iZXIgb2YgYXJndW1lbnRzIHRvICcgKyBzY2hlbWEubW9kZWwgKyAnLicgKyBpbmRleC5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgaW5kZXggcXVlcnlcbiAgICAgICAgICAgICAgICAgICAgdmFyIHEgPSBuZXcgb3JiLlEoKTtcbiAgICAgICAgICAgICAgICAgICAgXy5lYWNoKGluZGV4LmNvbHVtbnMsIGZ1bmN0aW9uIChjb2x1bW4sIGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHEgPSBxLmFuZChuZXcgb3JiLlEoY29sdW1uKS5pcyh2YXJnc1tpXSkpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmRzID0gc2NvcGVbc2NoZW1hLm1vZGVsXS5zZWxlY3Qoe3doZXJlOiBxfSk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBvcHRpb25zID0gdmFyZ3NbdmFyZ3MubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHZhciByZXF1ZXN0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXguZmxhZ3MuVW5pcXVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXF1ZXN0ID0gcmVjb3Jkcy5mZXRjaE9uZShvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3QgPSByZWNvcmRzLmZldGNoKG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXF1ZXN0O1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIG1vZGVsVHlwZSA9IG9yYi5Nb2RlbC5leHRlbmQoe1xuICAgICAgICAgICAgICAgIGlkQXR0cmlidXRlOiBzY2hlbWEuaWRDb2x1bW4sXG4gICAgICAgICAgICAgICAgdXJsUm9vdDogc2NoZW1hLnVybFJvb3QsXG4gICAgICAgICAgICAgICAgZGVmYXVsdHM6IGRlZmF1bHRzXG4gICAgICAgICAgICB9LCBjbHNfbWV0aG9kcyk7XG5cbiAgICAgICAgICAgIG1vZGVsVHlwZS5jb2xsZWN0aW9uID0gb3JiLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICBtb2RlbDogbW9kZWxUeXBlXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIG1vZGVsVHlwZTtcbiAgICAgICAgfSxcbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIsIGpRdWVyeSk7Il19
