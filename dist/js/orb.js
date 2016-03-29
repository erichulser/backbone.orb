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
                var defaults = {};

                schema.referenceScope = scope;

                // create the default values
                _.each(schema.columns, function (column, field) {
                    if (column.type !== 'Id') {
                        defaults[field] = column['default'];
                    }
                });

                // create the model
                scope[schema.model] = orb.Model.extend({
                    urlRoot: schema.urlRoot,
                    defaults: defaults
                }, {schema: schema});
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
            this.context = new orb.Context(context);
        },
        create: function (properties, options) {
            options = options || {};
            options.url = this.url();
            Backbone.Collection.prototype.create.call(this, properties, options);
        },
        copy: function () {
            var out = new this.constructor();
            out.urlRoot = this.urlRoot;
            out.model = this.model;
            out.context = _.extend({}, this.context);

            // create a copy of the where query
            if (this.context.where !== undefined) {
                out.context.where = this.context.where.copy();
            }

            if (this.context.columns !== undefined) {
                out.context.columns = this.context.columns.slice(0);
            }

            if (this.context.order && typeof(this.context.order) === 'object') {
                out.context.order = this.context.order.slice(0);
            }
            return out;
        },
        fetchCount: function (options) {
            var sub_select = this.copy();
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
            var new_collection = this.copy();
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
        refine: function (context) {
            var out = this.copy();
            out.context.merge(this.context.attributes);
            out.context.merge(context);
            return out;
        },
        url: function () {
            var url = (typeof(this.urlRoot) === 'string') ? this.urlRoot : this.urlRoot();
            if (this.context.get('view')) {
                return s.rtrim(url, '/') + '/' + this.context.get('view');
            } else {
                return url;
            }
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
                        this.set('expand', value);
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
                data = {key: value};
            } else {
                data = key;
            }

            var values = {};
            _.each(data, function (v, k) {
                if (k === 'expand' && v instanceof string) {
                    v = v.split(',');
                }

                if (_.hasOwnProperty(k, Defaults)) {
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
            options = options || {};

            // initialize information from the schema
            self.references = {};

            // create the reference information
            var schema = self.constructor.schema;
            if (schema) {
                _.each(schema.columns, function (column) {
                    if (column.type === 'Reference') {
                        self.references[column.name] = undefined;
                    }
                });

                _.each(schema.collectors, function (collector) {
                    if (collector.flags.Unique) {
                        self.references[collector.name] = undefined;
                    } else {
                        var model = schema.referenceScope[collector.model];
                        var records = new model.collection();
                        records.urlRoot = function () {
                            var root = self.urlRoot;
                            var record_id = self.get('id');
                            if (!(root && record_id)) {
                                return undefined;
                            } else {
                                var trimmed = s.trim(self.urlRoot, '/');
                                return [trimmed, record_id, collector.name].join('/');
                            }
                        };
                        self[collector.name] = records;
                    }
                });
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
                _.each(schema.columns, function (col) {
                    if (col.type === 'Reference' && col.name === attribute) {
                        column = col;
                    }
                });

                // get a reference column
                if (column && column.type === 'Reference') {
                    var record = this.references[attribute];
                    if (record === undefined) {
                        record = new schema.referenceScope[column.reference]({id: self.attributes[column.field]});
                        this.references[column.name] = record;
                    }
                    return record;
                }

                // get a collection of objects
                else if (collector) {
                    if (collector.flags.Unique) {
                        var record = this.references[attribute];
                        if (record === undefined) {
                            record = new schema.referenceScope[collector.model]();
                            record.urlRoot = this.url() + '/' + name;
                            this.references[attribute] = record;
                        }
                        return record;
                    } else {
                        return this[attribute];
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
                                self.references[collctor.name].update(data);
                            }
                        } else {
                            var records = undefined;
                            if (data instanceof Array) {
                                records = data;
                            } else {
                                records = data.records;
                            }

                            if (records !== undefined) {
                                self[collector.name].set(records);
                            }
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
                if (_.hasOwnProperty(self.references, attribute)) {
                    delete attributes[attribute];

                    if (value instanceof orb.Model) {
                        self.references[attribute] = value;
                    } else {
                        var ref = self.get(attribute);
                        ref.update(value);
                    }
                }

                // set collection information
                else if (_.hasOwnProperty(self, attribute)) {
                    delete attributes[attribute];
                    if (value instanceof orb.Collection) {
                        self[attribute] = value;
                    } else {
                        self[attribute].set(value);
                    }
                }
            });

            return Backbone.Model.prototype.set.call(this, attributes, options);
        },
        unset: function (attribute, options) {
            // unset a reference object
            if (this.references[name] !== undefined) {
                options = options || {};
                var data = this.references[name]
                delete data;
                if (!options.silent) {
                    this.trigger('change:' + name, data);
                }
            }

            // unset a collection
            else if (this[attribute] !== undefined) {
                this[attribute].reset();
            }

            // unset an attribute
            else {
                Backbone.Model.prototype.unset.call(this, attribute, options);
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
            var out = this.copy();
            out.set('op', orb.Q.Op.After);
            out.set('value', value);
            return out;
        },
        abs: function () {
            var out = this.copy();
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
            var out = this.copy();
            out.modify(orb.Q.Op.AsString);
            return out;
        },
        before: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.Before);
            out.set('value', value);
            return out;
        },
        between: function (a, b) {
            var out = this.copy();
            out.set('op', orb.Q.Op.Between);
            out.set('value', [a, b]);
            return out;
        },
        contains: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.copy();
            out.set('op', orb.Q.Op.Contains);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        copy: function () {
            var attrs = _.extend({}, this.attributes);
            attrs['functions'] = attrs['functions'].slice(0);
            attrs['math'] = attrs['math'].slice(0);
            return new orb.Q(attrs);

        },
        doesNotContain: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.copy();
            out.set('op', orb.Q.Op.DoesNotContain);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        doesNotEndwith: function (value, caseSensitive) {
            caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.copy();
            out.set('op', orb.Q.Op.DoesNotEndwith);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        doesNotMatch: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.copy();
            out.set('op', orb.Q.Op.DoesNotMatch);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        doesNotStartwith: function (value, caseSensitive) {
            caseSensitive = (caseSensitive === undefined) ? false : caseSensitive;
            var out = this.copy();
            out.set('op', orb.Q.Op.DoesNotStartwith);
            out.set('value', value);
            out.set('caseSensitive', caseSensitive);
            return out;
        },
        endswith: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.Endswith);
            out.set('value', value);
            return out;
        },
        greaterThan: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.GreaterThan);
            out.set('value', value);
            return out;
        },
        greaterThanOrEqual: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.GreaterThanOrEqual);
            out.set('value', value);
            return out;
        },
        is: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.Is);
            out.set('value', value);
            return out;
        },
        isNot: function (value) {
            var out = this.copy();
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
            var out = this.copy();
            out.set('op', orb.Q.Op.IsIn);
            out.set('value', value.slice(0));
            return out;
        },
        notIn: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.IsNotIn);
            out.set('value', value.slice(0));
            return out;
        },
        lessThan: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.LessThan);
            out.set('value', value.slice(0));
            return out;
        },
        lessThanOrEqual: function (value) {
            var out = this.copy();
            out.set('op', orb.Q.Op.LessThanOrEqual);
            out.set('value', value);
            return out;
        },
        lower: function () {
            var out = this.copy();
            out.modify(this.Function.Lower);
        },
        matches: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? true : caseSensitive;
            var out = this.copy();
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
            var out = this.copy();
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
            var out = this.copy();
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
            this.queries = options.queries || new orb.Collection();
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
        copy: function () {
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
            this.columns = new Backbone.Collection({model: orb.Column});
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
    }, {
        Flags: {
            ReadOnly:       Math.pow(2, 0),
            Private:        Math.pow(2, 1),
            Polymorphic:    Math.pow(2, 2),
            Primary:        Math.pow(2, 3),
            Autoincrement:  Math.pow(2, 4),
            Required:       Math.pow(2, 5),
            Unique:         Math.pow(2, 6),
            Encrypted:      Math.pow(2, 7),
            Searchable:     Math.pow(2, 8),
            Translatable:   Math.pow(2, 9),
            CaseSensitive:  Math.pow(2, 10),
            Virtual:        Math.pow(2, 11),
            Queryable:      Math.pow(2, 12)
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
    });
})(window.orb, jQuery);
},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWxsLmpzIiwic3JjL2NvbGxlY3Rpb24uanMiLCJzcmMvY29udGV4dC5qcyIsInNyYy9tb2RlbC5qcyIsInNyYy9xdWVyaWVzLmpzIiwic3JjL3NjaGVtYS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ3aW5kb3cub3JiID0ge1xuICAgIHJlYWR5OiBmdW5jdGlvbiAoYXBpX3Jvb3QsIG9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIHZhciBzY29wZSA9IG9wdGlvbnMuc2NvcGUgfHwge307XG4gICAgICAgIHZhciByZXNwO1xuICAgICAgICB2YXIgdXJsID0gYXBpX3Jvb3QgKyAnP3JldHVybmluZz1zY2hlbWEnO1xuXG4gICAgICAgIC8vIHN1cHBvcnQgQ09SUyBkZWZpbml0aW9uc1xuICAgICAgICBpZiAob3B0aW9ucy5jcm9zc0RvbWFpbikge1xuICAgICAgICAgICAgcmVzcCA9ICQuZ2V0SlNPTih7XG4gICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgIGNyb3NzRG9tYWluOiB0cnVlLFxuICAgICAgICAgICAgICAgIHByb2Nlc3NEYXRhOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogb3B0aW9ucy5lcnJvclxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB1c2UgZnJvbSBsb2NhbCBBUElcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXNwID0gJC5nZXQodXJsLCB7XG4gICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogb3B0aW9ucy5lcnJvclxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXNwLnN1Y2Nlc3MoZnVuY3Rpb24gKHNjaGVtYXMpIHtcbiAgICAgICAgICAgIF8uZWFjaChzY2hlbWFzLCBmdW5jdGlvbiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlZmF1bHRzID0ge307XG5cbiAgICAgICAgICAgICAgICBzY2hlbWEucmVmZXJlbmNlU2NvcGUgPSBzY29wZTtcblxuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgZGVmYXVsdCB2YWx1ZXNcbiAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2x1bW4sIGZpZWxkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2x1bW4udHlwZSAhPT0gJ0lkJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHNbZmllbGRdID0gY29sdW1uWydkZWZhdWx0J107XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgbW9kZWxcbiAgICAgICAgICAgICAgICBzY29wZVtzY2hlbWEubW9kZWxdID0gb3JiLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgICAgICAgICAgICAgIHVybFJvb3Q6IHNjaGVtYS51cmxSb290LFxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0czogZGVmYXVsdHNcbiAgICAgICAgICAgICAgICB9LCB7c2NoZW1hOiBzY2hlbWF9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBub3RpZnkgdGhlIHN5c3RlbSBvbiBzdWNjZXNzXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5zdWNjZXNzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3Moc2NvcGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5yZXF1aXJlKCcuL2NvbnRleHQnKTtcbnJlcXVpcmUoJy4vc2NoZW1hJyk7XG5yZXF1aXJlKCcuL2NvbGxlY3Rpb24nKTtcbnJlcXVpcmUoJy4vbW9kZWwnKTtcbnJlcXVpcmUoJy4vcXVlcmllcycpO1xuIiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuQ29sbGVjdGlvbiA9IEJhY2tib25lLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICAgICAgICAgIGNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gbmV3IG9yYi5Db250ZXh0KGNvbnRleHQpO1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGU6IGZ1bmN0aW9uIChwcm9wZXJ0aWVzLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIG9wdGlvbnMudXJsID0gdGhpcy51cmwoKTtcbiAgICAgICAgICAgIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNyZWF0ZS5jYWxsKHRoaXMsIHByb3BlcnRpZXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gbmV3IHRoaXMuY29uc3RydWN0b3IoKTtcbiAgICAgICAgICAgIG91dC51cmxSb290ID0gdGhpcy51cmxSb290O1xuICAgICAgICAgICAgb3V0Lm1vZGVsID0gdGhpcy5tb2RlbDtcbiAgICAgICAgICAgIG91dC5jb250ZXh0ID0gXy5leHRlbmQoe30sIHRoaXMuY29udGV4dCk7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIGNvcHkgb2YgdGhlIHdoZXJlIHF1ZXJ5XG4gICAgICAgICAgICBpZiAodGhpcy5jb250ZXh0LndoZXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvdXQuY29udGV4dC53aGVyZSA9IHRoaXMuY29udGV4dC53aGVyZS5jb3B5KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmNvbnRleHQuY29sdW1ucyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3V0LmNvbnRleHQuY29sdW1ucyA9IHRoaXMuY29udGV4dC5jb2x1bW5zLnNsaWNlKDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5jb250ZXh0Lm9yZGVyICYmIHR5cGVvZih0aGlzLmNvbnRleHQub3JkZXIpID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIG91dC5jb250ZXh0Lm9yZGVyID0gdGhpcy5jb250ZXh0Lm9yZGVyLnNsaWNlKDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZmV0Y2hDb3VudDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHZhciBzdWJfc2VsZWN0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5kYXRhKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5kYXRhLnJldHVybmluZyA9ICdjb3VudCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YSA9IHtyZXR1cm5pbmc6ICdjb3VudCd9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHN1Yl9zZWxlY3QuZmV0Y2gob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgY29udGV4dCA9IG5ldyBvcmIuQ29udGV4dChfLmNsb25lKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKSk7XG4gICAgICAgICAgICBjb250ZXh0Lm1lcmdlKG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGNvbnRleHQgc3BlY2lmaWMgb3B0aW9ucywgdXBkYXRlIHRoZSByb290IHF1ZXJ5XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShjb250ZXh0KSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YSA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLmRhdGEsIHtjb250ZXh0OiBKU09OLnN0cmluZ2lmeShjb250ZXh0LnRvSlNPTigpKX0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjYWxsIHRoZSBiYXNlIGNvbGxlY3Rpb24gY29udGV4dCBjb21tYW5kc1xuICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmZldGNoLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoT25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgbmV3X2NvbGxlY3Rpb24gPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIHZhciBvcHRzID0gXy5leHRlbmQoe30sIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICBsaW1pdDogMSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdGlvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3MoY29sbGVjdGlvbi5hdCgwKSwgZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2Vzcyh1bmRlZmluZWQsIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gbmV3X2NvbGxlY3Rpb24uZmV0Y2gob3B0cyk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlZmluZTogZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKHRoaXMuY29udGV4dC5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIG91dC5jb250ZXh0Lm1lcmdlKGNvbnRleHQpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdXJsID0gKHR5cGVvZih0aGlzLnVybFJvb3QpID09PSAnc3RyaW5nJykgPyB0aGlzLnVybFJvb3QgOiB0aGlzLnVybFJvb3QoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbnRleHQuZ2V0KCd2aWV3JykpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5ydHJpbSh1cmwsICcvJykgKyAnLycgKyB0aGlzLmNvbnRleHQuZ2V0KCd2aWV3Jyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB1cmw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIsIGpRdWVyeSk7IiwiKGZ1bmN0aW9uIChvcmIpIHtcbiAgICB2YXIgRGVmYXVsdHMgPSB7XG4gICAgICAgICdhdXRvSW5jcmVtZW50RW5hYmxlZCc6IHRydWUsXG4gICAgICAgICdjb2x1bW5zJzogdW5kZWZpbmVkLFxuICAgICAgICAnZGInOiB1bmRlZmluZWQsXG4gICAgICAgICdkYXRhYmFzZSc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ2Rpc3RpbmN0JzogZmFsc2UsXG4gICAgICAgICdkaXNpbmN0T24nOiAnJyxcbiAgICAgICAgJ2RyeVJ1bic6IGZhbHNlLFxuICAgICAgICAnZXhwYW5kJzogdW5kZWZpbmVkLFxuICAgICAgICAnZm9ybWF0JzogJ2pzb24nLFxuICAgICAgICAnZm9yY2UnOiBmYWxzZSxcbiAgICAgICAgJ2luZmxhdGVkJzogdHJ1ZSxcbiAgICAgICAgJ2xpbWl0JzogdW5kZWZpbmVkLFxuICAgICAgICAnbG9jYWxlJzogdW5kZWZpbmVkLFxuICAgICAgICAnbmFtZXNwYWNlJzogJycsXG4gICAgICAgICdvcmRlcic6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3BhZ2UnOiB1bmRlZmluZWQsXG4gICAgICAgICdwYWdlU2l6ZSc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3Njb3BlJzogdW5kZWZpbmVkLFxuICAgICAgICAncmV0dXJuaW5nJzogJ3JlY29yZHMnLFxuICAgICAgICAnc3RhcnQnOiB1bmRlZmluZWQsXG4gICAgICAgICd0aW1lem9uZSc6IHVuZGVmaW5lZCxcbiAgICAgICAgJ3doZXJlJzogdW5kZWZpbmVkXG4gICAgfTtcbiAgICBcbiAgICBvcmIuQ29udGV4dCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIG1lcmdlOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIF8uZWFjaChvdGhlciwgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSAnd2hlcmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB3aGVyZSA9IHNlbGYuZ2V0KCd3aGVyZScpO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2hlcmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdoZXJlID0gd2hlcmUuYW5kKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdoZXJlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zZXQoJ3doZXJlJywgd2hlcmUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChrZXkgPT09ICdleHBhbmQnKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBleHBhbmQgPSBzZWxmLmdldCgnZXhwYW5kJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBhbmQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cGFuZC5leHRlbmQodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXQoJ2V4cGFuZCcsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBkYXRhO1xuICAgICAgICAgICAgaWYgKCFfLmlzT2JqZWN0KGtleSkpIHtcbiAgICAgICAgICAgICAgICBkYXRhID0ge2tleTogdmFsdWV9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkYXRhID0ga2V5O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVzID0ge307XG4gICAgICAgICAgICBfLmVhY2goZGF0YSwgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICBpZiAoayA9PT0gJ2V4cGFuZCcgJiYgdiBpbnN0YW5jZW9mIHN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdi5zcGxpdCgnLCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChfLmhhc093blByb3BlcnR5KGssIERlZmF1bHRzKSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZXNba10gPSB2O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuc2V0LmNhbGwodGhpcywgdmFsdWVzKTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gXy5jbG9uZSh0aGlzLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgaWYgKG91dC53aGVyZSkge1xuICAgICAgICAgICAgICAgIG91dC53aGVyZSA9IG91dC53aGVyZS50b0pTT04oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLk1vZGVsID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgICAgICAvLyBpbml0aWFsaXplIGluZm9ybWF0aW9uIGZyb20gdGhlIHNjaGVtYVxuICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzID0ge307XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgcmVmZXJlbmNlIGluZm9ybWF0aW9uXG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gc2VsZi5jb25zdHJ1Y3Rvci5zY2hlbWE7XG4gICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgXy5lYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2x1bW4udHlwZSA9PT0gJ1JlZmVyZW5jZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sbGVjdG9ycywgZnVuY3Rpb24gKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdG9yLmZsYWdzLlVuaXF1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtb2RlbCA9IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2xsZWN0b3IubW9kZWxdO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZHMgPSBuZXcgbW9kZWwuY29sbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciByb290ID0gc2VsZi51cmxSb290O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmRfaWQgPSBzZWxmLmdldCgnaWQnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIShyb290ICYmIHJlY29yZF9pZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgdHJpbW1lZCA9IHMudHJpbShzZWxmLnVybFJvb3QsICcvJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBbdHJpbW1lZCwgcmVjb3JkX2lkLCBjb2xsZWN0b3IubmFtZV0uam9pbignLycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmW2NvbGxlY3Rvci5uYW1lXSA9IHJlY29yZHM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjbGFzcydzIG1ldGhvZFxuICAgICAgICAgICAgQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoYXR0cmlidXRlKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gdGhpcy5jb25zdHJ1Y3Rvci5zY2hlbWE7XG4gICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbGxlY3RvciA9IHNjaGVtYS5jb2xsZWN0b3JzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgdmFyIGNvbHVtbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2wpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbC50eXBlID09PSAnUmVmZXJlbmNlJyAmJiBjb2wubmFtZSA9PT0gYXR0cmlidXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW4gPSBjb2w7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIGdldCBhIHJlZmVyZW5jZSBjb2x1bW5cbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uICYmIGNvbHVtbi50eXBlID09PSAnUmVmZXJlbmNlJykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkID0gdGhpcy5yZWZlcmVuY2VzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWNvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2x1bW4ucmVmZXJlbmNlXSh7aWQ6IHNlbGYuYXR0cmlidXRlc1tjb2x1bW4uZmllbGRdfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlZmVyZW5jZXNbY29sdW1uLm5hbWVdID0gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gZ2V0IGEgY29sbGVjdGlvbiBvZiBvYmplY3RzXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoY29sbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0b3IuZmxhZ3MuVW5pcXVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkID0gdGhpcy5yZWZlcmVuY2VzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjb3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNvcmQgPSBuZXcgc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbGxlY3Rvci5tb2RlbF0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNvcmQudXJsUm9vdCA9IHRoaXMudXJsKCkgKyAnLycgKyBuYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVmZXJlbmNlc1thdHRyaWJ1dGVdID0gcmVjb3JkO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBnZXQgYSByZWd1bGFyIGF0dHJpYnV0ZVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLmdldC5jYWxsKHRoaXMsIGF0dHJpYnV0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBnZXQgYSByZWd1bGFyIGF0dHJpYnV0ZVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5nZXQuY2FsbCh0aGlzLCBhdHRyaWJ1dGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBwYXJzZTogZnVuY3Rpb24gKHJlc3BvbnNlLCBvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gc2VsZi5jb25zdHJ1Y3Rvci5zY2hlbWE7XG5cbiAgICAgICAgICAgIGlmIChzY2hlbWEgJiYgcmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAvLyBsb2FkIHJlZmVyZW5jZXNcbiAgICAgICAgICAgICAgICBfLmVhY2goc2NoZW1hLmNvbHVtbnMsIGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi50eXBlID09PSAnUmVmZXJlbmNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGRhdGEgPSByZXNwb25zZVtjb2x1bW4ubmFtZV07XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgcmVzcG9uc2VbY29sdW1uLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2VsZi5yZWZlcmVuY2VzW2NvbHVtbi5uYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbY29sdW1uLm5hbWVdID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2x1bW4ucmVmZXJlbmNlXShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbY29sdW1uLm5hbWVdLnVwZGF0ZShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIGxvYWQgY29sbGVjdG9yc1xuICAgICAgICAgICAgICAgIF8uZWFjaChzY2hlbWEuY29sbGVjdG9ycywgZnVuY3Rpb24gKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IHJlc3BvbnNlW2NvbGxlY3Rvci5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHJlc3BvbnNlW2NvbGxlY3Rvci5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0b3IuZmxhZ3MuVW5pcXVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWxmLnJlZmVyZW5jZXNbY29sbGVjdG9yLm5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2xsZWN0b3IubmFtZV0gPSBuZXcgc2NoZW1hLnJlZmVyZW5jZVNjb3BlW2NvbGxlY3Rvci5tb2RlbF0oZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxjdG9yLm5hbWVdLnVwZGF0ZShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWNvcmRzID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkcyA9IGRhdGE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkcyA9IGRhdGEucmVjb3JkcztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjb3JkcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGZbY29sbGVjdG9yLm5hbWVdLnNldChyZWNvcmRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcHJvY2VzcyB0aGUgYmFzZSBjYWxsXG4gICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnBhcnNlLmNhbGwodGhpcywgcmVzcG9uc2UsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChhdHRyaWJ1dGVzLCBvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBfLmVhY2goYXR0cmlidXRlcywgZnVuY3Rpb24gKHZhbHVlLCBhdHRyaWJ1dGUpIHtcbiAgICAgICAgICAgICAgICAvLyBzZXQgcmVmZXJlbmNlIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgaWYgKF8uaGFzT3duUHJvcGVydHkoc2VsZi5yZWZlcmVuY2VzLCBhdHRyaWJ1dGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZV07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2Ygb3JiLk1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbYXR0cmlidXRlXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlZiA9IHNlbGYuZ2V0KGF0dHJpYnV0ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWYudXBkYXRlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHNldCBjb2xsZWN0aW9uIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoXy5oYXNPd25Qcm9wZXJ0eShzZWxmLCBhdHRyaWJ1dGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBhdHRyaWJ1dGVzW2F0dHJpYnV0ZV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIG9yYi5Db2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmW2F0dHJpYnV0ZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGZbYXR0cmlidXRlXS5zZXQodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuc2V0LmNhbGwodGhpcywgYXR0cmlidXRlcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIHVuc2V0OiBmdW5jdGlvbiAoYXR0cmlidXRlLCBvcHRpb25zKSB7XG4gICAgICAgICAgICAvLyB1bnNldCBhIHJlZmVyZW5jZSBvYmplY3RcbiAgICAgICAgICAgIGlmICh0aGlzLnJlZmVyZW5jZXNbbmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgICAgIHZhciBkYXRhID0gdGhpcy5yZWZlcmVuY2VzW25hbWVdXG4gICAgICAgICAgICAgICAgZGVsZXRlIGRhdGE7XG4gICAgICAgICAgICAgICAgaWYgKCFvcHRpb25zLnNpbGVudCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoJ2NoYW5nZTonICsgbmFtZSwgZGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB1bnNldCBhIGNvbGxlY3Rpb25cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXNbYXR0cmlidXRlXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpc1thdHRyaWJ1dGVdLnJlc2V0KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHVuc2V0IGFuIGF0dHJpYnV0ZVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnVuc2V0LmNhbGwodGhpcywgYXR0cmlidXRlLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdmFyIGlkID0gdGhpcy5nZXQoJ2lkJyk7XG4gICAgICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb24udXJsKCkgKyAnLycgKyBpZDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLnVybCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS51cmwuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgc2NoZW1hOiB1bmRlZmluZWQsXG4gICAgICAgIGNvbGxlY3Rpb246IG9yYi5Db2xsZWN0aW9uLFxuICAgICAgICBhbGw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Qob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdDogZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gbmV3IHRoaXMuY29sbGVjdGlvbihjb250ZXh0KTtcbiAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IHRoaXMucHJvdG90eXBlLnVybFJvb3Q7XG4gICAgICAgICAgICByZWNvcmRzLm1vZGVsID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzO1xuICAgICAgICB9LFxuICAgICAgICBieUlkOiBmdW5jdGlvbiAoaWQsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIGNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuICAgICAgICAgICAgdmFyIHEgPSBuZXcgb3JiLlEoJ2lkJykuaXMoaWQpO1xuICAgICAgICAgICAgY29udGV4dC53aGVyZSA9IHEuYW5kKGNvbnRleHQud2hlcmUpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KCkuZmV0Y2hPbmUoY29udGV4dCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpO1xuIiwiKGZ1bmN0aW9uIChvcmIpIHtcbiAgICAvLyBkZWZpbmUgdGhlIGJhc2UgcXVlcnkgdHlwZVxuICAgIG9yYi5RID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG9wOiAnPT0nLFxuICAgICAgICAgICAgY29sdW1uOiB1bmRlZmluZWQsXG4gICAgICAgICAgICB0YWJsZTogJycsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiBmYWxzZSxcbiAgICAgICAgICAgIGZ1bmN0aW9uczogdW5kZWZpbmVkLFxuICAgICAgICAgICAgbWF0aDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgaW52ZXJ0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgdmFsdWU6IHVuZGVmaW5lZFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZihvcHRpb25zKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnY29sdW1uJywgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ2Z1bmN0aW9ucycpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnZnVuY3Rpb25zJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KCdtYXRoJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdtYXRoJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhZnRlcjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkFmdGVyKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYWJzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVuY3Rpb24uQWJzKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGFuZDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe1xuICAgICAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3AuQW5kLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFzU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KG9yYi5RLk9wLkFzU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJlZm9yZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJlZm9yZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJldHdlZW46IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJldHdlZW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCBbYSwgYl0pO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgY29udGFpbnM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQ29udGFpbnMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXR0cnMgPSBfLmV4dGVuZCh7fSwgdGhpcy5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGF0dHJzWydmdW5jdGlvbnMnXSA9IGF0dHJzWydmdW5jdGlvbnMnXS5zbGljZSgwKTtcbiAgICAgICAgICAgIGF0dHJzWydtYXRoJ10gPSBhdHRyc1snbWF0aCddLnNsaWNlKDApO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUShhdHRycyk7XG5cbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdENvbnRhaW46IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdENvbnRhaW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90RW5kd2l0aDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RFbmR3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdE1hdGNoOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RNYXRjaCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RTdGFydHdpdGg6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90U3RhcnR3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZW5kc3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5FbmRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuR3JlYXRlclRoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBncmVhdGVyVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpczogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOb3Q6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc05vdCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLmdldCgnY29sdW1uJykgPT09IHVuZGVmaW5lZCB8fCB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNVbmRlZmluZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgICBpbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzSW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBub3RJbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90SW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkxlc3NUaGFuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbGVzc1RoYW5PckVxdWFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW5PckVxdWFsKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbG93ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5Mb3dlcik7XG4gICAgICAgIH0sXG4gICAgICAgIG1hdGNoZXM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IHRydWUgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5NYXRjaGVzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbW9kaWZ5OiBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgdGhpcy5nZXQoJ2Z1bmN0aW9ucycpLnB1c2goZnVuYyk7XG4gICAgICAgIH0sXG4gICAgICAgIG9yOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5PcixcbiAgICAgICAgICAgICAgICAgICAgcXVlcmllczogW3RoaXMsIG90aGVyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBzdGFydHN3aXRoOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuU3RhcnRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3F1ZXJ5JyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0KCdjb2x1bW4nKSxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdGhpcy5nZXQoJ3ZhbHVlJylcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBmdW5jcyA9IHRoaXMuZ2V0KCdmdW5jdGlvbnMnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGZ1bmNzKSkge1xuICAgICAgICAgICAgICAgIHZhciBqZnVuY3MgPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2goZnVuY3MsIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIGpmdW5jcy5wdXNoKG9yYi5RLkZ1bmN0aW9uLmtleShmdW5jKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5mdW5jdGlvbnMgPSBqZnVuY3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXRoID0gdGhpcy5nZXQoJ21hdGgnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KG1hdGgpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGptYXRoID0gW107XG4gICAgICAgICAgICAgICAgXy5lYWNoKG1hdGgsIGZ1bmN0aW9uIChvcCkge1xuICAgICAgICAgICAgICAgICAgICBqbWF0aC5wdXNoKG9yYi5RLk1hdGgua2V5KG9wKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5tYXRoID0gam1hdGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgICB9LFxuICAgICAgICB1cHBlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bnRpb25zLlVwcGVyKTtcbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgT3A6IHtcbiAgICAgICAgICAgIElzOiAnPT0nLFxuICAgICAgICAgICAgSXNOb3Q6ICchPScsXG4gICAgICAgICAgICBMZXNzVGhhbjogJzwnLFxuICAgICAgICAgICAgTGVzc1RoYW5PckVxdWFsOiAnPD0nLFxuICAgICAgICAgICAgQmVmb3JlOiAnPCcsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbjogJz4nLFxuICAgICAgICAgICAgR3JlYXRlclRoYW5PckVxdWFsOiAnPj0nLFxuICAgICAgICAgICAgQWZ0ZXI6ICc+JyxcbiAgICAgICAgICAgIEJldHdlZW46ICdiZXR3ZWVuJyxcbiAgICAgICAgICAgIENvbnRhaW5zOiAnY29udGFpbnMnLFxuICAgICAgICAgICAgRG9lc05vdENvbnRhaW46IFwiZG9lc24ndCBjb250YWluXCIsXG4gICAgICAgICAgICBTdGFydHN3aXRoOiAnc3RhcnRzd2l0aCcsXG4gICAgICAgICAgICBFbmRzd2l0aDogJ2VuZHN3aXRoJyxcbiAgICAgICAgICAgIE1hdGNoZXM6ICdtYXRjaGVzJyxcbiAgICAgICAgICAgIERvZXNOb3RNYXRjaDogXCJkb2Vzbid0IG1hdGNoXCIsXG4gICAgICAgICAgICBJc0luOiAnaXMgaW4nLFxuICAgICAgICAgICAgSXNOb3RJbjogJ2lzIG5vdCBpbicsXG4gICAgICAgICAgICBEb2VzTm90U3RhcnR3aXRoOiBcImRvZXNuJ3Qgc3RhcnR3aXRoXCIsXG4gICAgICAgICAgICBEb2VzTm90RW5kd2l0aDogXCJkb2Vzbid0IGVuZHdpdGhcIixcbiAgICAgICAgICAgIEFuZDogJ2FuZCcsXG4gICAgICAgICAgICBPcjogJ29yJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIE1hdGg6IHtcbiAgICAgICAgICAgIEFkZDogJysnLFxuICAgICAgICAgICAgU3VidHJhY3Q6ICctJyxcbiAgICAgICAgICAgIE11bHRpcGx5OiAnKicsXG4gICAgICAgICAgICBEaXZpZGU6ICcvJyxcbiAgICAgICAgICAgIEFuZDogJyYnLFxuICAgICAgICAgICAgT3I6ICd8JyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIEZ1bmN0aW9uOiB7XG4gICAgICAgICAgICBMb3dlcjogJ2xvd2VyJyxcbiAgICAgICAgICAgIFVwcGVyOiAndXBwZXInLFxuICAgICAgICAgICAgQWJzOiAnYWJzJyxcbiAgICAgICAgICAgIEFzU3RyaW5nOiAnc3RyJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5RQ29tcG91bmQgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICdhbmQnXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMucXVlcmllcyA9IG9wdGlvbnMucXVlcmllcyB8fCBuZXcgb3JiLkNvbGxlY3Rpb24oKTtcbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2V0KCdvcCcpID09PSBvcmIuUS5PcC5BbmQpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLnF1ZXJpZXMuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuQW5kLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKFt0aGlzLCBvdGhlcl0pfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNvcHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIG9wOiB0aGlzLmdldCgnb3AnKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiB0aGlzLnF1ZXJpZXMuc2xpY2UoMClcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFtX251bGwgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5xdWVyaWVzLmVhY2goZnVuY3Rpb24gKHN1YnF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdWJxdWVyeS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgICAgICBhbV9udWxsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYW1fbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLk9yKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5xdWVyaWVzLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIG5ld19xdWVyaWVzLnB1c2gob3RoZXIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5PciwgcXVlcmllczogW3RoaXMsIG90aGVyXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2NvbXBvdW5kJyxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiB0aGlzLnF1ZXJpZXMudG9KU09OKClcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLkluZGV4ID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZGJuYW1lOiAnJyxcbiAgICAgICAgICAgIHVuaXF1ZTogZmFsc2UsXG4gICAgICAgICAgICBvcmRlcjogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY2FjaGVkOiBmYWxzZSxcbiAgICAgICAgICAgIHRpbWVvdXQ6IDBcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oe21vZGVsOiBvcmIuQ29sdW1ufSk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdldCgnbmFtZScpLFxuICAgICAgICAgICAgICAgIGRibmFtZTogdGhpcy5nZXQoJ2RibmFtZScpLFxuICAgICAgICAgICAgICAgIHVuaXF1ZTogdGhpcy5nZXQoJ3VuaXF1ZScpLFxuICAgICAgICAgICAgICAgIG9yZGVyOiB0aGlzLmdldCgnb3JkZXInKSxcbiAgICAgICAgICAgICAgICBjYWNoZWQ6IHRoaXMuZ2V0KCdjYWNoZWQnKSxcbiAgICAgICAgICAgICAgICB0aW1lb3V0OiB0aGlzLmdldCgndGltZW91dCcpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5QaXBlID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgdGhyb3VnaDogJycsXG4gICAgICAgICAgICBmcm9tOiAnJyxcbiAgICAgICAgICAgIHRvOiAnJyxcbiAgICAgICAgICAgIHVuaXF1ZTogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgdGhyb3VnaDogdGhpcy5nZXQoJ3Rocm91Z2gnKSxcbiAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmdldCgnZnJvbScpLFxuICAgICAgICAgICAgICAgIHRvOiB0aGlzLmdldCgndG8nKSxcbiAgICAgICAgICAgICAgICB1bmlxdWU6IHRoaXMuZ2V0KCd1bmlxdWUnKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLkNvbHVtbiA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZmllbGQ6ICcnLFxuICAgICAgICAgICAgZGlzcGxheTogJycsXG4gICAgICAgICAgICByZWZlcmVuY2U6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGluZGV4OiB1bmRlZmluZWQsXG4gICAgICAgICAgICBmbGFnczogMCxcbiAgICAgICAgICAgIGRlZmF1bHQ6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogJ2FzYydcbiAgICAgICAgfSxcbiAgICAgICAgdGVzdEZsYWc6IGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgICAgICByZXR1cm4gKHNlbGYuZ2V0KCdmbGFncycpICYgZmxhZykgPiAwO1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMuZ2V0KCdpbmRleCcpO1xuICAgICAgICAgICAgdmFyIGluZGV4X2pzb24gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleF9qc29uID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBpbmRleC5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVkOiBpbmRleC5nZXQoJ2NhY2hlZCcpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiBpbmRleC5nZXQoJ3RpbWVvdXQnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiB0aGlzLmdldCgndHlwZScpLFxuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgZmllbGQ6IHRoaXMuZ2V0KCdmaWVsZCcpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgZmxhZ3M6IHRoaXMuZ2V0KCdmbGFncycpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogdGhpcy5nZXQoJ2RlZmF1bHRPcmRlcicpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHRoaXMuZ2V0KCdkZWZhdWx0JyksXG4gICAgICAgICAgICAgICAgaW5kZXg6IGluZGV4X2pzb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIEZsYWdzOiB7XG4gICAgICAgICAgICBSZWFkT25seTogICAgICAgTWF0aC5wb3coMiwgMCksXG4gICAgICAgICAgICBQcml2YXRlOiAgICAgICAgTWF0aC5wb3coMiwgMSksXG4gICAgICAgICAgICBQb2x5bW9ycGhpYzogICAgTWF0aC5wb3coMiwgMiksXG4gICAgICAgICAgICBQcmltYXJ5OiAgICAgICAgTWF0aC5wb3coMiwgMyksXG4gICAgICAgICAgICBBdXRvaW5jcmVtZW50OiAgTWF0aC5wb3coMiwgNCksXG4gICAgICAgICAgICBSZXF1aXJlZDogICAgICAgTWF0aC5wb3coMiwgNSksXG4gICAgICAgICAgICBVbmlxdWU6ICAgICAgICAgTWF0aC5wb3coMiwgNiksXG4gICAgICAgICAgICBFbmNyeXB0ZWQ6ICAgICAgTWF0aC5wb3coMiwgNyksXG4gICAgICAgICAgICBTZWFyY2hhYmxlOiAgICAgTWF0aC5wb3coMiwgOCksXG4gICAgICAgICAgICBUcmFuc2xhdGFibGU6ICAgTWF0aC5wb3coMiwgOSksXG4gICAgICAgICAgICBDYXNlU2Vuc2l0aXZlOiAgTWF0aC5wb3coMiwgMTApLFxuICAgICAgICAgICAgVmlydHVhbDogICAgICAgIE1hdGgucG93KDIsIDExKSxcbiAgICAgICAgICAgIFF1ZXJ5YWJsZTogICAgICBNYXRoLnBvdygyLCAxMilcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLlNjaGVtYSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBuYW1lOiAnJyxcbiAgICAgICAgICAgIGFic3RyYWN0OiBmYWxzZSxcbiAgICAgICAgICAgIGRibmFtZTogJycsXG4gICAgICAgICAgICBkaXNwbGF5OiAnJyxcbiAgICAgICAgICAgIGluaGVyaXRzOiAnJyxcbiAgICAgICAgICAgIHR5cGU6ICcnXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMuY29tcGFyYXRvciA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoJ25hbWUnKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5pbmRleGVzID0gbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMuaW5kZXhlcy5jb21wYXJhdG9yID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgnbmFtZScpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5waXBlcyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnBpcGVzLmNvbXBhcmF0b3IgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbW9kZWwuZ2V0KCduYW1lJyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdGhpcy5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICBhYnN0cmFjdDogdGhpcy5nZXQoJ2Fic3RyYWN0JyksXG4gICAgICAgICAgICAgICAgZGJuYW1lOiB0aGlzLmdldCgnZGJuYW1lJyksXG4gICAgICAgICAgICAgICAgZGlzcGxheTogdGhpcy5nZXQoJ2Rpc3BsYXknKSxcbiAgICAgICAgICAgICAgICBpbmhlcml0czogdGhpcy5nZXQoJ2luaGVyaXRzJyksXG4gICAgICAgICAgICAgICAgY29sdW1uczogdGhpcy5jb2x1bW5zLnRvSlNPTigpLFxuICAgICAgICAgICAgICAgIGluZGV4ZXM6IHRoaXMuaW5kZXhlcy50b0pTT04oKSxcbiAgICAgICAgICAgICAgICBwaXBlczogdGhpcy5waXBlcy50b0pTT04oKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiXX0=
