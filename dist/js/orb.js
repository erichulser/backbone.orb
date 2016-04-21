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
        fetchCount: function (options) {
            options = options || {};
            var sub_select = this.clone();
            if (options.data) {
                options.data.returning = 'count';
            } else {
                options.data = {returning: 'count'};
            }
            return sub_select.fetch(options);
        },
        fetch: function (options) {
            options = options || {};
            var context = new orb.Context(_.clone(this.context.attributes));
            context.merge(options);

            // if we have context specific options, update the root query
            if (!_.isEmpty(context)) {
                options.data = _.extend({}, options.data, {context: JSON.stringify(context.toJSON())});
            }

            // call the base collection context commands
            return Backbone.Collection.prototype.fetch.call(this, options);
        },
        fetchOne: function (options) {
            options = options || {};
            var new_collection = this.clone();
            var opts = _.extend({}, options, {
                limit: 1,
                success: function (collection, data) {
                    if (options.success) {
                        if (collection.length) {
                            options.success(collection.at(0), data);
                        } else {
                            options.success(undefined, data);
                        }
                    }
                }
            });
            return new_collection.fetch(opts);
        },
        parse: function (response, options) {
            if (response instanceof Array) {
                return response;
            } else if (response.records !== undefined) {
                return response.records;
            } else {
                var records = [];
                if (response.count) {
                    for (var i=0; i < response.count; i++) {
                        records.push(undefined);
                    }

                    if (response.first !== undefined) {
                        records[0] = new this.constructor.model(response.first);
                    }
                    if (response.last !== undefined) {
                        records[records.length - 1] = new this.constructor.model(response.last);
                    }
                } else {
                    if (response.first !== undefined) {
                        records.push(new this.constructor.model(response.first));
                    }
                    if (response.last !== undefined) {
                        records.push(new this.constructor.model(response.last));
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
        url: function () {
            if (this.source && this.name) {
                var root = this.source.urlRoot;

                if (root) {
                    var record_id = this.source.get('id');
                    if (record_id) {
                        var trimmed = s.trim(root, '/')
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

            // initialize information from the schema
            if (!self._initialized) {
                self._initialized = true;

                self.references = {};
                self.collections = {};

                options = options || {};

                // create the reference information
                var schema = self.constructor.schema;
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
                                    records.url =function () {
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


            // call the base class's method
            Backbone.Model.prototype.initialize.call(this, options);
        },
        get: function (attribute) {
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
                        record = new schema.referenceScope[column.reference]({id: self.attributes[column.field]});
                        this.references[column.name] = record;
                    }
                    return record;
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
                                self.references[column.name].update(data);
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
                                self.references[collector.name].update(data);
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
        set: function (attributes, options) {
            var self = this;

            _.each(attributes, function (value, attribute) {
                // set reference information
                if (_.has(self.references, attribute)) {
                    delete attributes[attribute];

                    if (value instanceof orb.Model) {
                        self.references[attribute] = value;
                    } else {
                        var ref = self.get(attribute);
                        ref.update(value);
                    }
                }

                // set collection information
                else if (_.has(self.collections, attribute)) {
                    delete attributes[attribute];
                    if (value instanceof orb.Collection) {
                        self.collections[attribute] = value;
                    } else {
                        self.collections[attribute].set(value);
                    }
                }
            });

            return Backbone.Model.prototype.set.call(this, attributes, options);
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
            this.queries = new Backbone.Collection(options.queries);
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
                queries: this.queries.slice(0)
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
            type: ''
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWxsLmpzIiwic3JjL2NvbGxlY3Rpb24uanMiLCJzcmMvY29udGV4dC5qcyIsInNyYy9tb2RlbC5qcyIsInNyYy9xdWVyaWVzLmpzIiwic3JjL3NjaGVtYS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ3aW5kb3cub3JiID0ge1xuICAgIHJlYWR5OiBmdW5jdGlvbiAoYXBpX3Jvb3QsIG9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIHZhciBzY29wZSA9IG9wdGlvbnMuc2NvcGUgfHwge307XG4gICAgICAgIHZhciByZXNwO1xuICAgICAgICB2YXIgdXJsID0gYXBpX3Jvb3QgKyAnP3JldHVybmluZz1zY2hlbWEnO1xuXG4gICAgICAgIC8vIHN1cHBvcnQgQ09SUyBkZWZpbml0aW9uc1xuICAgICAgICBpZiAob3B0aW9ucy5jcm9zc0RvbWFpbikge1xuICAgICAgICAgICAgcmVzcCA9ICQuZ2V0SlNPTih7XG4gICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgIGNyb3NzRG9tYWluOiB0cnVlLFxuICAgICAgICAgICAgICAgIHByb2Nlc3NEYXRhOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogb3B0aW9ucy5lcnJvclxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB1c2UgZnJvbSBsb2NhbCBBUElcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXNwID0gJC5nZXQodXJsLCB7XG4gICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogb3B0aW9ucy5lcnJvclxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXNwLnN1Y2Nlc3MoZnVuY3Rpb24gKHNjaGVtYXMpIHtcbiAgICAgICAgICAgIF8uZWFjaChzY2hlbWFzLCBmdW5jdGlvbiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSBtb2RlbFxuICAgICAgICAgICAgICAgIHNjb3BlW3NjaGVtYS5tb2RlbF0gPSBvcmIuU2NoZW1hLmdlbmVyYXRlTW9kZWwoe3NjaGVtYTogc2NoZW1hLCBzY29wZTogc2NvcGV9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBub3RpZnkgdGhlIHN5c3RlbSBvbiBzdWNjZXNzXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5zdWNjZXNzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3Moc2NvcGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5yZXF1aXJlKCcuL2NvbnRleHQnKTtcbnJlcXVpcmUoJy4vc2NoZW1hJyk7XG5yZXF1aXJlKCcuL2NvbGxlY3Rpb24nKTtcbnJlcXVpcmUoJy4vbW9kZWwnKTtcbnJlcXVpcmUoJy4vcXVlcmllcycpO1xuIiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuQ29sbGVjdGlvbiA9IEJhY2tib25lLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICAgICAgICAgIGNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuXG4gICAgICAgICAgICB0aGlzLnVybFJvb3QgPSBjb250ZXh0LnVybFJvb3QgfHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgdGhpcy5uYW1lID0gY29udGV4dC5uYW1lIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMuc291cmNlID0gY29udGV4dC5zb3VyY2UgfHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gbmV3IG9yYi5Db250ZXh0KGNvbnRleHQpO1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGU6IGZ1bmN0aW9uIChwcm9wZXJ0aWVzLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIG9wdGlvbnMudXJsID0gdGhpcy51cmwoKTtcbiAgICAgICAgICAgIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNyZWF0ZS5jYWxsKHRoaXMsIHByb3BlcnRpZXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNsb25lLmNhbGwodGhpcyk7XG4gICAgICAgICAgICBvdXQuY29udGV4dCA9IHRoaXMuY29udGV4dC5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0Lm5hbWUgPSB0aGlzLm5hbWU7XG4gICAgICAgICAgICBvdXQuc291cmNlID0gdGhpcy5zb3VyY2U7XG4gICAgICAgICAgICBvdXQudXJsUm9vdCA9IHRoaXMudXJsUm9vdDtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoQ291bnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBzdWJfc2VsZWN0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuZGF0YSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YS5yZXR1cm5pbmcgPSAnY291bnQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSB7cmV0dXJuaW5nOiAnY291bnQnfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdWJfc2VsZWN0LmZldGNoKG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIGNvbnRleHQgPSBuZXcgb3JiLkNvbnRleHQoXy5jbG9uZSh0aGlzLmNvbnRleHQuYXR0cmlidXRlcykpO1xuICAgICAgICAgICAgY29udGV4dC5tZXJnZShvcHRpb25zKTtcblxuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBjb250ZXh0IHNwZWNpZmljIG9wdGlvbnMsIHVwZGF0ZSB0aGUgcm9vdCBxdWVyeVxuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkoY29udGV4dCkpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSBfLmV4dGVuZCh7fSwgb3B0aW9ucy5kYXRhLCB7Y29udGV4dDogSlNPTi5zdHJpbmdpZnkoY29udGV4dC50b0pTT04oKSl9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjb2xsZWN0aW9uIGNvbnRleHQgY29tbWFuZHNcbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Db2xsZWN0aW9uLnByb3RvdHlwZS5mZXRjaC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaE9uZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIG5ld19jb2xsZWN0aW9uID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgdmFyIG9wdHMgPSBfLmV4dGVuZCh7fSwgb3B0aW9ucywge1xuICAgICAgICAgICAgICAgIGxpbWl0OiAxLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0aW9uLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2Vzcyhjb2xsZWN0aW9uLmF0KDApLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5zdWNjZXNzKHVuZGVmaW5lZCwgZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBuZXdfY29sbGVjdGlvbi5mZXRjaChvcHRzKTtcbiAgICAgICAgfSxcbiAgICAgICAgcGFyc2U6IGZ1bmN0aW9uIChyZXNwb25zZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHJlc3BvbnNlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3BvbnNlLnJlY29yZHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5yZWNvcmRzO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVjb3JkcyA9IFtdO1xuICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5jb3VudCkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCByZXNwb25zZS5jb3VudDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzLnB1c2godW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5maXJzdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzWzBdID0gbmV3IHRoaXMuY29uc3RydWN0b3IubW9kZWwocmVzcG9uc2UuZmlyc3QpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5sYXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHNbcmVjb3Jkcy5sZW5ndGggLSAxXSA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yLm1vZGVsKHJlc3BvbnNlLmxhc3QpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLmZpcnN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChuZXcgdGhpcy5jb25zdHJ1Y3Rvci5tb2RlbChyZXNwb25zZS5maXJzdCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5sYXN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMucHVzaChuZXcgdGhpcy5jb25zdHJ1Y3Rvci5tb2RlbChyZXNwb25zZS5sYXN0KSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVmaW5lOiBmdW5jdGlvbiAoY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKGNvbnRleHQpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zb3VyY2UgJiYgdGhpcy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvb3QgPSB0aGlzLnNvdXJjZS51cmxSb290O1xuXG4gICAgICAgICAgICAgICAgaWYgKHJvb3QpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZF9pZCA9IHRoaXMuc291cmNlLmdldCgnaWQnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZF9pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRyaW1tZWQgPSBzLnRyaW0ocm9vdCwgJy8nKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFt0cmltbWVkLCByZWNvcmRfaWQsIHRoaXMubmFtZV0uam9pbignLycpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJvb3Q7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy51cmxSb290O1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiLCBqUXVlcnkpOyIsIihmdW5jdGlvbiAob3JiKSB7XG4gICAgdmFyIERlZmF1bHRzID0ge1xuICAgICAgICAnYXV0b0luY3JlbWVudEVuYWJsZWQnOiB0cnVlLFxuICAgICAgICAnY29sdW1ucyc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ2RiJzogdW5kZWZpbmVkLFxuICAgICAgICAnZGF0YWJhc2UnOiB1bmRlZmluZWQsXG4gICAgICAgICdkaXN0aW5jdCc6IGZhbHNlLFxuICAgICAgICAnZGlzaW5jdE9uJzogJycsXG4gICAgICAgICdkcnlSdW4nOiBmYWxzZSxcbiAgICAgICAgJ2V4cGFuZCc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ2Zvcm1hdCc6ICdqc29uJyxcbiAgICAgICAgJ2ZvcmNlJzogZmFsc2UsXG4gICAgICAgICdpbmZsYXRlZCc6IHRydWUsXG4gICAgICAgICdsaW1pdCc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ2xvY2FsZSc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ25hbWVzcGFjZSc6ICcnLFxuICAgICAgICAnb3JkZXInOiB1bmRlZmluZWQsXG4gICAgICAgICdwYWdlJzogdW5kZWZpbmVkLFxuICAgICAgICAncGFnZVNpemUnOiB1bmRlZmluZWQsXG4gICAgICAgICdzY29wZSc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3JldHVybmluZyc6ICdyZWNvcmRzJyxcbiAgICAgICAgJ3N0YXJ0JzogdW5kZWZpbmVkLFxuICAgICAgICAndGltZXpvbmUnOiB1bmRlZmluZWQsXG4gICAgICAgICd3aGVyZSc6IHVuZGVmaW5lZFxuICAgIH07XG4gICAgXG4gICAgb3JiLkNvbnRleHQgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5jbG9uZS5jYWxsKHRoaXMpO1xuXG4gICAgICAgICAgICAvLyBlbnN1cmUgd2UgZG8gYSBkZWVwIGNvcHlcbiAgICAgICAgICAgIGlmIChvdXQuYXR0cmlidXRlcy5jb2x1bW5zICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvdXQuYXR0cmlidXRlcy5jb2x1bW5zID0gb3V0LmF0dHJpYnV0ZXMuY29sdW1ucy5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG91dC5hdHRyaWJ1dGVzLm9yZGVyICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIG91dC5hdHRyaWJ1dGVzLm9yZGVyID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIG91dC5hdHRyaWJ1dGVzLm9yZGVyID0gb3V0LmF0dHJpYnV0ZXMub3JkZXIuc2xpY2UoMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvdXQuYXR0cmlidXRlcy53aGVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3V0LmF0dHJpYnV0ZXMud2hlcmUgPSBvdXQuYXR0cmlidXRlcy53aGVyZS5jbG9uZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBtZXJnZTogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBfLmVhY2gob3RoZXIsIGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gJ3doZXJlJykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgd2hlcmUgPSBzZWxmLmdldCgnd2hlcmUnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdoZXJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aGVyZSA9IHdoZXJlLmFuZCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aGVyZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuc2V0KCd3aGVyZScsIHdoZXJlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoa2V5ID09PSAnZXhwYW5kJykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZXhwYW5kID0gc2VsZi5nZXQoJ2V4cGFuZCcpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwYW5kKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBleHBhbmQuZXh0ZW5kKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuc2V0KCdleHBhbmQnLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgZGF0YTtcbiAgICAgICAgICAgIGlmICghXy5pc09iamVjdChrZXkpKSB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IHt9O1xuICAgICAgICAgICAgICAgIGRhdGFba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkYXRhID0ga2V5O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVzID0ge307XG4gICAgICAgICAgICBfLmVhY2goZGF0YSwgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICBpZiAoayA9PT0gJ2V4cGFuZCcgJiYgdHlwZW9mIHYgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSB2LnNwbGl0KCcsJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKF8ua2V5cyhEZWZhdWx0cykuaW5kZXhPZihrKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzW2tdID0gdjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnNldC5jYWxsKHRoaXMsIHZhbHVlcyk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IF8uY2xvbmUodGhpcy5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGlmIChvdXQud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQud2hlcmUgPSBvdXQud2hlcmUudG9KU09OKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiKTsiLCIoZnVuY3Rpb24gKG9yYiwgJCkge1xuICAgIG9yYi5Nb2RlbCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIC8vIGluaXRpYWxpemUgaW5mb3JtYXRpb24gZnJvbSB0aGUgc2NoZW1hXG4gICAgICAgICAgICBpZiAoIXNlbGYuX2luaXRpYWxpemVkKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5faW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzID0ge307XG4gICAgICAgICAgICAgICAgc2VsZi5jb2xsZWN0aW9ucyA9IHt9O1xuXG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgICAgICAgICAgICAvLyBjcmVhdGUgdGhlIHJlZmVyZW5jZSBpbmZvcm1hdGlvblxuICAgICAgICAgICAgICAgIHZhciBzY2hlbWEgPSBzZWxmLmNvbnN0cnVjdG9yLnNjaGVtYTtcbiAgICAgICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi50eXBlID09PSAnUmVmZXJlbmNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sbGVjdG9ycywgZnVuY3Rpb24gKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xsZWN0b3IuZmxhZ3MuU3RhdGljKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5VbmlxdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbW9kZWwgPSBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sbGVjdG9yLm1vZGVsXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZHM7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXNlIGRlZmF1bHQgbW9kZWxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRzID0gbmV3IG1vZGVsLmNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMuc291cmNlID0gc2VsZjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMubmFtZSA9IGNvbGxlY3Rvci5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5tb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbT1JCIEVycm9yXSBDb3VsZCBub3QgZmluZCBtb2RlbDogJyArIGNvbGxlY3Rvci5tb2RlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3Jkcy51cmwgPWZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3MudHJpbShzZWxmLnVybFJvb3QsICcvJyksIHNlbGYuZ2V0KCdpZCcpLCBjb2xsZWN0b3IubmFtZV0uam9pbignLycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuY29sbGVjdGlvbnNbY29sbGVjdG9yLm5hbWVdID0gcmVjb3JkcztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZltjb2xsZWN0b3IubmFtZV0gPSByZWNvcmRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIC8vIGNhbGwgdGhlIGJhc2UgY2xhc3MncyBtZXRob2RcbiAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IHRoaXMuY29uc3RydWN0b3Iuc2NoZW1hO1xuICAgICAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgICAgICAgIHZhciBjb2xsZWN0b3IgPSBzY2hlbWEuY29sbGVjdG9yc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgIHZhciBjb2x1bW4gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdmFyIHJlY29yZCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2wpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbC50eXBlID09PSAnUmVmZXJlbmNlJyAmJiBjb2wubmFtZSA9PT0gYXR0cmlidXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW4gPSBjb2w7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIGdldCBhIHJlZmVyZW5jZSBjb2x1bW5cbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uICYmIGNvbHVtbi50eXBlID09PSAnUmVmZXJlbmNlJykge1xuICAgICAgICAgICAgICAgICAgICByZWNvcmQgPSB0aGlzLnJlZmVyZW5jZXNbYXR0cmlidXRlXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmQgPSBuZXcgc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbHVtbi5yZWZlcmVuY2VdKHtpZDogc2VsZi5hdHRyaWJ1dGVzW2NvbHVtbi5maWVsZF19KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBnZXQgYSBjb2xsZWN0aW9uIG9mIG9iamVjdHNcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjb2xsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5VbmlxdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZCA9IHRoaXMucmVmZXJlbmNlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2xsZWN0b3IubW9kZWxdKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkLnVybFJvb3QgPSB0aGlzLnVybCgpICsgJy8nICsgbmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlZmVyZW5jZXNbYXR0cmlidXRlXSA9IHJlY29yZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gZ2V0IGEgcmVndWxhciBhdHRyaWJ1dGVcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5nZXQuY2FsbCh0aGlzLCBhdHRyaWJ1dGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZ2V0IGEgcmVndWxhciBhdHRyaWJ1dGVcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuZ2V0LmNhbGwodGhpcywgYXR0cmlidXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcGFyc2U6IGZ1bmN0aW9uIChyZXNwb25zZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHRoaXMucmVmZXJlbmNlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSBzZWxmLmNvbnN0cnVjdG9yLnNjaGVtYTtcblxuICAgICAgICAgICAgaWYgKHNjaGVtYSAmJiByZXNwb25zZSkge1xuICAgICAgICAgICAgICAgIC8vIGxvYWQgcmVmZXJlbmNlc1xuICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sdW1uLnR5cGUgPT09ICdSZWZlcmVuY2UnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IHJlc3BvbnNlW2NvbHVtbi5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSByZXNwb25zZVtjb2x1bW4ubmFtZV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWxmLnJlZmVyZW5jZXNbY29sdW1uLm5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSBuZXcgc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbHVtbi5yZWZlcmVuY2VdKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0udXBkYXRlKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8gbG9hZCBjb2xsZWN0b3JzXG4gICAgICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5jb2xsZWN0b3JzLCBmdW5jdGlvbiAoY29sbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2VbY29sbGVjdG9yLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgcmVzcG9uc2VbY29sbGVjdG9yLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5VbmlxdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlbGYucmVmZXJlbmNlc1tjb2xsZWN0b3IubmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSA9IG5ldyBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sbGVjdG9yLm1vZGVsXShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbY29sbGVjdG9yLm5hbWVdLnVwZGF0ZShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjb2xsZWN0aW9uID0gc2VsZi5jb2xsZWN0aW9uc1tjb2xsZWN0b3IubmFtZV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbi5zZXQoY29sbGVjdGlvbi5wYXJzZShkYXRhKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcHJvY2VzcyB0aGUgYmFzZSBjYWxsXG4gICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnBhcnNlLmNhbGwodGhpcywgcmVzcG9uc2UsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChhdHRyaWJ1dGVzLCBvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIF8uZWFjaChhdHRyaWJ1dGVzLCBmdW5jdGlvbiAodmFsdWUsIGF0dHJpYnV0ZSkge1xuICAgICAgICAgICAgICAgIC8vIHNldCByZWZlcmVuY2UgaW5mb3JtYXRpb25cbiAgICAgICAgICAgICAgICBpZiAoXy5oYXMoc2VsZi5yZWZlcmVuY2VzLCBhdHRyaWJ1dGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZV07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2Ygb3JiLk1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbYXR0cmlidXRlXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlZiA9IHNlbGYuZ2V0KGF0dHJpYnV0ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWYudXBkYXRlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHNldCBjb2xsZWN0aW9uIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoXy5oYXMoc2VsZi5jb2xsZWN0aW9ucywgYXR0cmlidXRlKSkge1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgYXR0cmlidXRlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBvcmIuQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5jb2xsZWN0aW9uc1thdHRyaWJ1dGVdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmNvbGxlY3Rpb25zW2F0dHJpYnV0ZV0uc2V0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnNldC5jYWxsKHRoaXMsIGF0dHJpYnV0ZXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICB1bnNldDogZnVuY3Rpb24gKGF0dHJpYnV0ZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgLy8gdW5zZXQgYSByZWZlcmVuY2Ugb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5yZWZlcmVuY2VzW25hbWVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IHRoaXMucmVmZXJlbmNlc1tuYW1lXTtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5yZWZlcmVuY2VzW25hbWVdO1xuICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucy5zaWxlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdjaGFuZ2U6JyArIG5hbWUsIGRhdGEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdW5zZXQgYSBjb2xsZWN0aW9uXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLmNvbGxlY3Rpb25zW2F0dHJpYnV0ZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlvbnNbYXR0cmlidXRlXS5yZXNldCgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB1bnNldCBhbiBhdHRyaWJ1dGVcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUudW5zZXQuY2FsbCh0aGlzLCBhdHRyaWJ1dGUsIG9wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB1cmw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB2YXIgaWQgPSB0aGlzLmdldCgnaWQnKTtcbiAgICAgICAgICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbi51cmwoKSArICcvJyArIGlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb24udXJsKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnVybC5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSwge1xuICAgICAgICBzY2hlbWE6IHVuZGVmaW5lZCxcbiAgICAgICAgY29sbGVjdGlvbjogb3JiLkNvbGxlY3Rpb24sXG4gICAgICAgIGFsbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdChvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0OiBmdW5jdGlvbiAoY29udGV4dCkge1xuICAgICAgICAgICAgdmFyIHJlY29yZHMgPSBuZXcgdGhpcy5jb2xsZWN0aW9uKGNvbnRleHQpO1xuICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gdGhpcy5wcm90b3R5cGUudXJsUm9vdDtcbiAgICAgICAgICAgIHJlY29yZHMubW9kZWwgPSB0aGlzO1xuICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgIH0sXG4gICAgICAgIGJ5SWQ6IGZ1bmN0aW9uIChpZCwgY29udGV4dCkge1xuICAgICAgICAgICAgY29udGV4dCA9IGNvbnRleHQgfHwge307XG4gICAgICAgICAgICB2YXIgcSA9IG5ldyBvcmIuUSgnaWQnKS5pcyhpZCk7XG4gICAgICAgICAgICBjb250ZXh0LndoZXJlID0gcS5hbmQoY29udGV4dC53aGVyZSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoKS5mZXRjaE9uZShjb250ZXh0KTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7XG4iLCIoZnVuY3Rpb24gKG9yYikge1xuICAgIC8vIGRlZmluZSB0aGUgYmFzZSBxdWVyeSB0eXBlXG4gICAgb3JiLlEgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICc9PScsXG4gICAgICAgICAgICBjb2x1bW46IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHRhYmxlOiAnJyxcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgICAgICAgZnVuY3Rpb25zOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBtYXRoOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBpbnZlcnRlZDogZmFsc2UsXG4gICAgICAgICAgICB2YWx1ZTogdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mKG9wdGlvbnMpID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdjb2x1bW4nLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdldCgnZnVuY3Rpb25zJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdmdW5jdGlvbnMnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ21hdGgnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ21hdGgnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFmdGVyOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkFmdGVyKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYWJzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bmN0aW9uLkFicyk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBhbmQ6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLkFuZCxcbiAgICAgICAgICAgICAgICAgICAgcXVlcmllczogW3RoaXMsIG90aGVyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhc1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkob3JiLlEuT3AuQXNTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmVmb3JlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJlZm9yZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJldHdlZW46IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5CZXR3ZWVuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgW2EsIGJdKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRhaW5zOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Db250YWlucyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGNsb25lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXR0cnMgPSBfLmV4dGVuZCh7fSwgdGhpcy5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGF0dHJzWydmdW5jdGlvbnMnXSA9IGF0dHJzWydmdW5jdGlvbnMnXS5zbGljZSgwKTtcbiAgICAgICAgICAgIGF0dHJzWydtYXRoJ10gPSBhdHRyc1snbWF0aCddLnNsaWNlKDApO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUShhdHRycyk7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RDb250YWluOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90Q29udGFpbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RFbmR3aXRoOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RFbmR3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdE1hdGNoOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90TWF0Y2gpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90U3RhcnR3aXRoOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RTdGFydHdpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBlbmRzd2l0aDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5FbmRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkdyZWF0ZXJUaGFuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZ3JlYXRlclRoYW5PckVxdWFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkdyZWF0ZXJUaGFuT3JFcXVhbCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOb3Q6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNOb3QpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpc051bGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy5nZXQoJ2NvbHVtbicpID09PSB1bmRlZmluZWQgfHwgdGhpcy5nZXQoJ3ZhbHVlJykgPT09IHVuZGVmaW5lZCk7XG4gICAgICAgIH0sXG4gICAgICAgIGlzVW5kZWZpbmVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXQoJ3ZhbHVlJykgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICAgICAgaW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIG5vdEluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90SW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5MZXNzVGhhbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxlc3NUaGFuT3JFcXVhbDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5MZXNzVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsb3dlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5Mb3dlcik7XG4gICAgICAgIH0sXG4gICAgICAgIG1hdGNoZXM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IHRydWUgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTWF0Y2hlcyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIG1vZGlmeTogZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgIHRoaXMuZ2V0KCdmdW5jdGlvbnMnKS5wdXNoKGZ1bmMpO1xuICAgICAgICB9LFxuICAgICAgICBvcjogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe1xuICAgICAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3AuT3IsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgc3RhcnRzd2l0aDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5TdGFydHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncXVlcnknLFxuICAgICAgICAgICAgICAgIGNvbHVtbjogdGhpcy5nZXQoJ2NvbHVtbicpLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHZhbHVlOiB0aGlzLmdldCgndmFsdWUnKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIGZ1bmNzID0gdGhpcy5nZXQoJ2Z1bmN0aW9ucycpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkoZnVuY3MpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGpmdW5jcyA9IFtdO1xuICAgICAgICAgICAgICAgIF8uZWFjaChmdW5jcywgZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgICAgICAgICAgamZ1bmNzLnB1c2gob3JiLlEuRnVuY3Rpb24ua2V5KGZ1bmMpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLmZ1bmN0aW9ucyA9IGpmdW5jcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hdGggPSB0aGlzLmdldCgnbWF0aCcpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkobWF0aCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgam1hdGggPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2gobWF0aCwgZnVuY3Rpb24gKG9wKSB7XG4gICAgICAgICAgICAgICAgICAgIGptYXRoLnB1c2gob3JiLlEuTWF0aC5rZXkob3ApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLm1hdGggPSBqbWF0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgIH0sXG4gICAgICAgIHVwcGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bnRpb25zLlVwcGVyKTtcbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgT3A6IHtcbiAgICAgICAgICAgIElzOiAnPT0nLFxuICAgICAgICAgICAgSXNOb3Q6ICchPScsXG4gICAgICAgICAgICBMZXNzVGhhbjogJzwnLFxuICAgICAgICAgICAgTGVzc1RoYW5PckVxdWFsOiAnPD0nLFxuICAgICAgICAgICAgQmVmb3JlOiAnPCcsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbjogJz4nLFxuICAgICAgICAgICAgR3JlYXRlclRoYW5PckVxdWFsOiAnPj0nLFxuICAgICAgICAgICAgQWZ0ZXI6ICc+JyxcbiAgICAgICAgICAgIEJldHdlZW46ICdiZXR3ZWVuJyxcbiAgICAgICAgICAgIENvbnRhaW5zOiAnY29udGFpbnMnLFxuICAgICAgICAgICAgRG9lc05vdENvbnRhaW46IFwiZG9lc24ndCBjb250YWluXCIsXG4gICAgICAgICAgICBTdGFydHN3aXRoOiAnc3RhcnRzd2l0aCcsXG4gICAgICAgICAgICBFbmRzd2l0aDogJ2VuZHN3aXRoJyxcbiAgICAgICAgICAgIE1hdGNoZXM6ICdtYXRjaGVzJyxcbiAgICAgICAgICAgIERvZXNOb3RNYXRjaDogXCJkb2Vzbid0IG1hdGNoXCIsXG4gICAgICAgICAgICBJc0luOiAnaXMgaW4nLFxuICAgICAgICAgICAgSXNOb3RJbjogJ2lzIG5vdCBpbicsXG4gICAgICAgICAgICBEb2VzTm90U3RhcnR3aXRoOiBcImRvZXNuJ3Qgc3RhcnR3aXRoXCIsXG4gICAgICAgICAgICBEb2VzTm90RW5kd2l0aDogXCJkb2Vzbid0IGVuZHdpdGhcIixcbiAgICAgICAgICAgIEFuZDogJ2FuZCcsXG4gICAgICAgICAgICBPcjogJ29yJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIE1hdGg6IHtcbiAgICAgICAgICAgIEFkZDogJysnLFxuICAgICAgICAgICAgU3VidHJhY3Q6ICctJyxcbiAgICAgICAgICAgIE11bHRpcGx5OiAnKicsXG4gICAgICAgICAgICBEaXZpZGU6ICcvJyxcbiAgICAgICAgICAgIEFuZDogJyYnLFxuICAgICAgICAgICAgT3I6ICd8JyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIEZ1bmN0aW9uOiB7XG4gICAgICAgICAgICBMb3dlcjogJ2xvd2VyJyxcbiAgICAgICAgICAgIFVwcGVyOiAndXBwZXInLFxuICAgICAgICAgICAgQWJzOiAnYWJzJyxcbiAgICAgICAgICAgIEFzU3RyaW5nOiAnc3RyJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5RQ29tcG91bmQgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICdhbmQnXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMucXVlcmllcyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKG9wdGlvbnMucXVlcmllcyk7XG4gICAgICAgIH0sXG4gICAgICAgIGFuZDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdldCgnb3AnKSA9PT0gb3JiLlEuT3AuQW5kKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5xdWVyaWVzLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIG5ld19xdWVyaWVzLnB1c2gob3RoZXIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLkFuZCwgcXVlcmllczogbmV3X3F1ZXJpZXN9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuQW5kLCBxdWVyaWVzOiBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbihbdGhpcywgb3RoZXJdKX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgb3A6IHRoaXMuZ2V0KCdvcCcpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHRoaXMucXVlcmllcy5zbGljZSgwKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZChvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYW1fbnVsbCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnF1ZXJpZXMuZWFjaChmdW5jdGlvbiAoc3VicXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN1YnF1ZXJ5LmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtX251bGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBhbV9udWxsO1xuICAgICAgICB9LFxuICAgICAgICBvcjogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdldCgnb3AnKSA9PT0gb3JiLlEuT3AuT3IpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLnF1ZXJpZXMuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuT3IsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBbdGhpcywgb3RoZXJdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY29tcG91bmQnLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHRoaXMucXVlcmllcy50b0pTT04oKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuSW5kZXggPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICBkYm5hbWU6ICcnLFxuICAgICAgICAgICAgdW5pcXVlOiBmYWxzZSxcbiAgICAgICAgICAgIG9yZGVyOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBjYWNoZWQ6IGZhbHNlLFxuICAgICAgICAgICAgdGltZW91dDogMFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgQ29sdW1ucyA9IEJhY2tib25lLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICBtb2RlbDogb3JiLkNvbHVtblxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IG5ldyBDb2x1bW5zKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdldCgnbmFtZScpLFxuICAgICAgICAgICAgICAgIGRibmFtZTogdGhpcy5nZXQoJ2RibmFtZScpLFxuICAgICAgICAgICAgICAgIHVuaXF1ZTogdGhpcy5nZXQoJ3VuaXF1ZScpLFxuICAgICAgICAgICAgICAgIG9yZGVyOiB0aGlzLmdldCgnb3JkZXInKSxcbiAgICAgICAgICAgICAgICBjYWNoZWQ6IHRoaXMuZ2V0KCdjYWNoZWQnKSxcbiAgICAgICAgICAgICAgICB0aW1lb3V0OiB0aGlzLmdldCgndGltZW91dCcpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5QaXBlID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgdGhyb3VnaDogJycsXG4gICAgICAgICAgICBmcm9tOiAnJyxcbiAgICAgICAgICAgIHRvOiAnJyxcbiAgICAgICAgICAgIHVuaXF1ZTogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgdGhyb3VnaDogdGhpcy5nZXQoJ3Rocm91Z2gnKSxcbiAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmdldCgnZnJvbScpLFxuICAgICAgICAgICAgICAgIHRvOiB0aGlzLmdldCgndG8nKSxcbiAgICAgICAgICAgICAgICB1bmlxdWU6IHRoaXMuZ2V0KCd1bmlxdWUnKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLkNvbHVtbiA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZmllbGQ6ICcnLFxuICAgICAgICAgICAgZGlzcGxheTogJycsXG4gICAgICAgICAgICByZWZlcmVuY2U6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGluZGV4OiB1bmRlZmluZWQsXG4gICAgICAgICAgICBmbGFnczogMCxcbiAgICAgICAgICAgIGRlZmF1bHQ6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogJ2FzYydcbiAgICAgICAgfSxcbiAgICAgICAgdGVzdEZsYWc6IGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgICAgICByZXR1cm4gKHNlbGYuZ2V0KCdmbGFncycpICYgZmxhZykgPiAwO1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMuZ2V0KCdpbmRleCcpO1xuICAgICAgICAgICAgdmFyIGluZGV4X2pzb24gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleF9qc29uID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBpbmRleC5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVkOiBpbmRleC5nZXQoJ2NhY2hlZCcpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiBpbmRleC5nZXQoJ3RpbWVvdXQnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiB0aGlzLmdldCgndHlwZScpLFxuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgZmllbGQ6IHRoaXMuZ2V0KCdmaWVsZCcpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgZmxhZ3M6IHRoaXMuZ2V0KCdmbGFncycpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogdGhpcy5nZXQoJ2RlZmF1bHRPcmRlcicpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHRoaXMuZ2V0KCdkZWZhdWx0JyksXG4gICAgICAgICAgICAgICAgaW5kZXg6IGluZGV4X2pzb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5TY2hlbWEgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICBhYnN0cmFjdDogZmFsc2UsXG4gICAgICAgICAgICBkYm5hbWU6ICcnLFxuICAgICAgICAgICAgZGlzcGxheTogJycsXG4gICAgICAgICAgICBpbmhlcml0czogJycsXG4gICAgICAgICAgICB0eXBlOiAnJ1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zLmNvbXBhcmF0b3IgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbW9kZWwuZ2V0KCduYW1lJylcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHRoaXMuaW5kZXhlcyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmluZGV4ZXMuY29tcGFyYXRvciA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoJ25hbWUnKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHRoaXMucGlwZXMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5waXBlcy5jb21wYXJhdG9yID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgnbmFtZScpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgYWJzdHJhY3Q6IHRoaXMuZ2V0KCdhYnN0cmFjdCcpLFxuICAgICAgICAgICAgICAgIGRibmFtZTogdGhpcy5nZXQoJ2RibmFtZScpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgaW5oZXJpdHM6IHRoaXMuZ2V0KCdpbmhlcml0cycpLFxuICAgICAgICAgICAgICAgIGNvbHVtbnM6IHRoaXMuY29sdW1ucy50b0pTT04oKSxcbiAgICAgICAgICAgICAgICBpbmRleGVzOiB0aGlzLmluZGV4ZXMudG9KU09OKCksXG4gICAgICAgICAgICAgICAgcGlwZXM6IHRoaXMucGlwZXMudG9KU09OKClcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIGdlbmVyYXRlTW9kZWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBzY2hlbWEgPSBvcHRpb25zLnNjaGVtYTtcbiAgICAgICAgICAgIHZhciBzY29wZSA9IG9wdGlvbnMuc2NvcGUgfHwge307XG4gICAgICAgICAgICB2YXIgZGVmYXVsdHMgPSB7fTtcblxuICAgICAgICAgICAgc2NoZW1hLnJlZmVyZW5jZVNjb3BlID0gc2NvcGU7XG5cbiAgICAgICAgICAgIHZhciBjbHNfbWV0aG9kcyA9IHtzY2hlbWE6IHNjaGVtYX07XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgZGVmYXVsdCB2YWx1ZXNcbiAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sdW1ucywgZnVuY3Rpb24gKGNvbHVtbiwgZmllbGQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uLnR5cGUgIT09ICdJZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHNbZmllbGRdID0gY29sdW1uWydkZWZhdWx0J107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGxvYWQgY29sbGVjdG9yc1xuICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5jb2xsZWN0b3JzLCBmdW5jdGlvbiAoY29sbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5mbGFncy5TdGF0aWMpIHtcbiAgICAgICAgICAgICAgICAgICAgY2xzX21ldGhvZHNbY29sbGVjdG9yLm5hbWVdID0gZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rvci5tb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBuZXcgc2NvcGVbY29sbGVjdG9yLm1vZGVsXS5jb2xsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3Jkcy51cmwgPSBzY2hlbWEudXJsUm9vdCArICcvJyArIGNvbGxlY3Rvci5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGxvYWQgaW5kZXhlc1xuICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5pbmRleGVzLCBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBjbHNfbWV0aG9kc1tpbmRleC5uYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHZhcmdzID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGFyZ3VtZW50cy5sZW5ndGggLSAxKSAhPT0gXy5zaXplKGluZGV4LmNvbHVtbnMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyAoJ0ludmFsaWQgbnVtYmVyIG9mIGFyZ3VtZW50cyB0byAnICsgc2NoZW1hLm1vZGVsICsgJy4nICsgaW5kZXgubmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBjcmVhdGUgdGhlIGluZGV4IHF1ZXJ5XG4gICAgICAgICAgICAgICAgICAgIHZhciBxID0gbmV3IG9yYi5RKCk7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChpbmRleC5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uLCBpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxID0gcS5hbmQobmV3IG9yYi5RKGNvbHVtbikuaXModmFyZ3NbaV0pKVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkcyA9IHNjb3BlW3NjaGVtYS5tb2RlbF0uc2VsZWN0KHt3aGVyZTogcX0pO1xuICAgICAgICAgICAgICAgICAgICB2YXIgb3B0aW9ucyA9IHZhcmdzW3ZhcmdzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVxdWVzdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4LmZsYWdzLlVuaXF1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWVzdCA9IHJlY29yZHMuZmV0Y2hPbmUob3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXF1ZXN0ID0gcmVjb3Jkcy5mZXRjaChvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVxdWVzdDtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBtb2RlbFR5cGUgPSBvcmIuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICB1cmxSb290OiBzY2hlbWEudXJsUm9vdCxcbiAgICAgICAgICAgICAgICBkZWZhdWx0czogZGVmYXVsdHNcbiAgICAgICAgICAgIH0sIGNsc19tZXRob2RzKTtcblxuICAgICAgICAgICAgbW9kZWxUeXBlLmNvbGxlY3Rpb24gPSBvcmIuQ29sbGVjdGlvbi5leHRlbmQoe1xuICAgICAgICAgICAgICAgIG1vZGVsOiBtb2RlbFR5cGVcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gbW9kZWxUeXBlO1xuICAgICAgICB9LFxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiXX0=
