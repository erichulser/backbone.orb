(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.orb = {};

require('./schema');
require('./collection');
require('./model');
require('./queries');
},{"./collection":2,"./model":3,"./queries":4,"./schema":5}],2:[function(require,module,exports){
(function (orb, $) {
    orb.Collection = Backbone.Collection.extend({
        initialize: function () {
            this.lookup = {};
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
            out.lookup = _.extend({}, this.lookup);

            // create a copy of the where query
            if (this.lookup.where !== undefined) {
                out.lookup.where = this.lookup.where.copy();
            }

            if (this.lookup.columns !== undefined) {
                out.lookup.columns = this.lookup.columns.slice(0);
            }

            if (this.lookup.order && typeof(this.lookup.order) === 'object') {
                out.lookup.order = this.lookup.order.slice(0);
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
            var lookup = {};

            // setup the where query
            var where = undefined;
            if (this.lookup.where) {
                where = this.lookup.where.and(options.where);
            } else if (options.where) {
                where = options.where;
            }
            if (where && !where.isNull()) {
                lookup.where = where.toJSON();
            }

            // setup the rest of the lookup options
            if (options.limit || this.lookup.limit) {
                lookup.limit = options.limit || this.lookup.limit;
            }
            if (options.order || this.lookup.order) {
                lookup.order = options.order || this.lookup.order;
            }
            if (options.expand || this.lookup.expand) {
                lookup.expand = options.expand || this.lookup.expand;
            }

            // if we have lookup specific options, update the root query
            if (!_.isEmpty(lookup)) {
                options.data = _.extend({lookup: JSON.stringify(lookup)}, options.data);
            }

            // call the base collection lookup commands
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
        refine: function (lookup) {
            var out = this.copy();

            // merge the where lookups
            if (out.lookup.where) {
                out.lookup.where = out.lookup.where.and(lookup.where);
            } else if (lookup.where) {
                out.lookup.where = lookup.where;
            }

            // remove the where option
            delete lookup.where;

            // replace the other options
            out.lookup = _.extend(out.lookup, lookup)

            return out;
        },
        url: function () {
            var url = (typeof(this.urlRoot) === 'string') ? this.urlRoot : this.urlRoot();
            if (this.lookup.view) {
                return s.rtrim(url, '/') + '/' + this.lookup.view;
            } else {
                return url;
            }
        }
    });
})(window.orb, jQuery);
},{}],3:[function(require,module,exports){
(function (orb, $) {
    orb.Model = Backbone.Model.extend({
        initialize: function (options) {
            options = options || {};
            // setup defaults based on the schema
            if (this.schema) {
                var defaults = {};
                _.each(this.schema.columns || [], function (column) {
                    if (column.default !== undefined) {
                        defaults[column.field] = column.default;
                    }
                });
                options = _.extend(defaults, options);
            }

            // store references as an object
            this.references = {};

            // call the base class's method
            Backbone.Model.prototype.initialize.call(this, options);
        },
        addCollection: function (name, model, options) {
            options = options || {};
            var self = this;
            var fetched = this.get(name);
            var records = (_.isEmpty(fetched)) ? new model.collection() : new model.collection(_.map(fetched, function (attrs) { new model(attrs) }));
            records.model = model;
            if (options.urlRoot) {
                records.urlRoot = options.urlRoot;
            } else {
                records.urlRoot = function () {
                    return s.rtrim(self.urlRoot, '/') + '/' + self.get('id') + '/' + (options.urlSuffix || name);
                }
            }
            this[name] = records;

            return records;
        },
        addReference: function (name, model, options) {
            options = options || {};
            var self = this;
            var getter = options.getter || 'get' + name[0].toUpperCase() + name.slice(1);
            var setter = options.setter || 'set' + name[0].toUpperCase() + name.slice(1);
            var field = options.field || s.underscored(name) + '_id';

            // create the getter & setter methods
            self[getter] = function () {
                if (!self.references[name]) {
                    if (options.reverseLookup) {
                        var ref = new model();
                        ref.urlRoot = this.url() + '/' + name;
                        self.references[name] = ref;
                    } else {
                        // initialize with loaded properties
                        var props = _.extend({id: self.get(field)}, self.get(name));
                        self.references[name] = new model(props);
                    }
                }
                return self.references[name];
            };
            self[setter] = function (record) {
                self.references[name] = record;
                self.set(field, record ? record.get('id') : null);
            };
        },
        clearReference: function (name) {
            delete this.references[name];
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
        select: function (lookup) {
            var records = new this.collection();
            records.lookup = _.extend({}, records.lookup, lookup);
            records.urlRoot = this.prototype.urlRoot;
            records.model = this;
            return records;
        },
        byId: function (id, options) {
            options = options || {};
            var q = new orb.Q('id').is(id);
            options.where = q.and(options.where);
            return this.select().fetchOne(options);
        }
    });
})(window.orb);
},{}],4:[function(require,module,exports){
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
            op: 'And'
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
            _.each(this.queries, function (subquery) {
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
},{}],5:[function(require,module,exports){
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
            name: '',
            field: '',
            display: '',
            index: undefined,
            flags: 0,
            default: undefined,
            defaultOrder: 'asc',
            type: ''
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
            inherits: ''
        },
        initialize: function () {
            this.columns = new Backbone.Collection({model: orb.Column});
            this.columns.comparator = function (model) {
                return model.get('name')
            };

            this.indexes = new Backbone.Collection({model: orb.Index});
            this.indexes.comparator = function (model) {
                return model.get('name');
            };

            this.pipes = new Backbone.Collection({model: orb.Pipe});
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWxsLmpzIiwic3JjL2NvbGxlY3Rpb24uanMiLCJzcmMvbW9kZWwuanMiLCJzcmMvcXVlcmllcy5qcyIsInNyYy9zY2hlbWEuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIndpbmRvdy5vcmIgPSB7fTtcblxucmVxdWlyZSgnLi9zY2hlbWEnKTtcbnJlcXVpcmUoJy4vY29sbGVjdGlvbicpO1xucmVxdWlyZSgnLi9tb2RlbCcpO1xucmVxdWlyZSgnLi9xdWVyaWVzJyk7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuQ29sbGVjdGlvbiA9IEJhY2tib25lLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5sb29rdXAgPSB7fTtcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlOiBmdW5jdGlvbiAocHJvcGVydGllcywgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICBvcHRpb25zLnVybCA9IHRoaXMudXJsKCk7XG4gICAgICAgICAgICBCYWNrYm9uZS5Db2xsZWN0aW9uLnByb3RvdHlwZS5jcmVhdGUuY2FsbCh0aGlzLCBwcm9wZXJ0aWVzLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgY29weTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKCk7XG4gICAgICAgICAgICBvdXQudXJsUm9vdCA9IHRoaXMudXJsUm9vdDtcbiAgICAgICAgICAgIG91dC5tb2RlbCA9IHRoaXMubW9kZWw7XG4gICAgICAgICAgICBvdXQubG9va3VwID0gXy5leHRlbmQoe30sIHRoaXMubG9va3VwKTtcblxuICAgICAgICAgICAgLy8gY3JlYXRlIGEgY29weSBvZiB0aGUgd2hlcmUgcXVlcnlcbiAgICAgICAgICAgIGlmICh0aGlzLmxvb2t1cC53aGVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC53aGVyZSA9IHRoaXMubG9va3VwLndoZXJlLmNvcHkoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMubG9va3VwLmNvbHVtbnMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAuY29sdW1ucyA9IHRoaXMubG9va3VwLmNvbHVtbnMuc2xpY2UoMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmxvb2t1cC5vcmRlciAmJiB0eXBlb2YodGhpcy5sb29rdXAub3JkZXIpID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAub3JkZXIgPSB0aGlzLmxvb2t1cC5vcmRlci5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoQ291bnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgc3ViX3NlbGVjdCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuZGF0YSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YS5yZXR1cm5pbmcgPSAnY291bnQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSB7cmV0dXJuaW5nOiAnY291bnQnfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdWJfc2VsZWN0LmZldGNoKG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIGxvb2t1cCA9IHt9O1xuXG4gICAgICAgICAgICAvLyBzZXR1cCB0aGUgd2hlcmUgcXVlcnlcbiAgICAgICAgICAgIHZhciB3aGVyZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICh0aGlzLmxvb2t1cC53aGVyZSkge1xuICAgICAgICAgICAgICAgIHdoZXJlID0gdGhpcy5sb29rdXAud2hlcmUuYW5kKG9wdGlvbnMud2hlcmUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvcHRpb25zLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgd2hlcmUgPSBvcHRpb25zLndoZXJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdoZXJlICYmICF3aGVyZS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIGxvb2t1cC53aGVyZSA9IHdoZXJlLnRvSlNPTigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXR1cCB0aGUgcmVzdCBvZiB0aGUgbG9va3VwIG9wdGlvbnNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmxpbWl0IHx8IHRoaXMubG9va3VwLmxpbWl0KSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLmxpbWl0ID0gb3B0aW9ucy5saW1pdCB8fCB0aGlzLmxvb2t1cC5saW1pdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvcHRpb25zLm9yZGVyIHx8IHRoaXMubG9va3VwLm9yZGVyKSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLm9yZGVyID0gb3B0aW9ucy5vcmRlciB8fCB0aGlzLmxvb2t1cC5vcmRlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvcHRpb25zLmV4cGFuZCB8fCB0aGlzLmxvb2t1cC5leHBhbmQpIHtcbiAgICAgICAgICAgICAgICBsb29rdXAuZXhwYW5kID0gb3B0aW9ucy5leHBhbmQgfHwgdGhpcy5sb29rdXAuZXhwYW5kO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGxvb2t1cCBzcGVjaWZpYyBvcHRpb25zLCB1cGRhdGUgdGhlIHJvb3QgcXVlcnlcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGxvb2t1cCkpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSBfLmV4dGVuZCh7bG9va3VwOiBKU09OLnN0cmluZ2lmeShsb29rdXApfSwgb3B0aW9ucy5kYXRhKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjb2xsZWN0aW9uIGxvb2t1cCBjb21tYW5kc1xuICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmZldGNoLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoT25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgbmV3X2NvbGxlY3Rpb24gPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIHZhciBvcHRzID0gXy5leHRlbmQoe30sIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICBsaW1pdDogMSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdGlvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3MoY29sbGVjdGlvbi5hdCgwKSwgZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2Vzcyh1bmRlZmluZWQsIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gbmV3X2NvbGxlY3Rpb24uZmV0Y2gob3B0cyk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlZmluZTogZnVuY3Rpb24gKGxvb2t1cCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuXG4gICAgICAgICAgICAvLyBtZXJnZSB0aGUgd2hlcmUgbG9va3Vwc1xuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQubG9va3VwLndoZXJlID0gb3V0Lmxvb2t1cC53aGVyZS5hbmQobG9va3VwLndoZXJlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobG9va3VwLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC53aGVyZSA9IGxvb2t1cC53aGVyZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSB3aGVyZSBvcHRpb25cbiAgICAgICAgICAgIGRlbGV0ZSBsb29rdXAud2hlcmU7XG5cbiAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIG90aGVyIG9wdGlvbnNcbiAgICAgICAgICAgIG91dC5sb29rdXAgPSBfLmV4dGVuZChvdXQubG9va3VwLCBsb29rdXApXG5cbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIHVybDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHVybCA9ICh0eXBlb2YodGhpcy51cmxSb290KSA9PT0gJ3N0cmluZycpID8gdGhpcy51cmxSb290IDogdGhpcy51cmxSb290KCk7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29rdXAudmlldykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzLnJ0cmltKHVybCwgJy8nKSArICcvJyArIHRoaXMubG9va3VwLnZpZXc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB1cmw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIsIGpRdWVyeSk7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuTW9kZWwgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICAvLyBzZXR1cCBkZWZhdWx0cyBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gICAgICAgICAgICBpZiAodGhpcy5zY2hlbWEpIHtcbiAgICAgICAgICAgICAgICB2YXIgZGVmYXVsdHMgPSB7fTtcbiAgICAgICAgICAgICAgICBfLmVhY2godGhpcy5zY2hlbWEuY29sdW1ucyB8fCBbXSwgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sdW1uLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHNbY29sdW1uLmZpZWxkXSA9IGNvbHVtbi5kZWZhdWx0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IF8uZXh0ZW5kKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc3RvcmUgcmVmZXJlbmNlcyBhcyBhbiBvYmplY3RcbiAgICAgICAgICAgIHRoaXMucmVmZXJlbmNlcyA9IHt9O1xuXG4gICAgICAgICAgICAvLyBjYWxsIHRoZSBiYXNlIGNsYXNzJ3MgbWV0aG9kXG4gICAgICAgICAgICBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBhZGRDb2xsZWN0aW9uOiBmdW5jdGlvbiAobmFtZSwgbW9kZWwsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIGZldGNoZWQgPSB0aGlzLmdldChuYW1lKTtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gKF8uaXNFbXB0eShmZXRjaGVkKSkgPyBuZXcgbW9kZWwuY29sbGVjdGlvbigpIDogbmV3IG1vZGVsLmNvbGxlY3Rpb24oXy5tYXAoZmV0Y2hlZCwgZnVuY3Rpb24gKGF0dHJzKSB7IG5ldyBtb2RlbChhdHRycykgfSkpO1xuICAgICAgICAgICAgcmVjb3Jkcy5tb2RlbCA9IG1vZGVsO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMudXJsUm9vdCkge1xuICAgICAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IG9wdGlvbnMudXJsUm9vdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcy5ydHJpbShzZWxmLnVybFJvb3QsICcvJykgKyAnLycgKyBzZWxmLmdldCgnaWQnKSArICcvJyArIChvcHRpb25zLnVybFN1ZmZpeCB8fCBuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzW25hbWVdID0gcmVjb3JkcztcblxuICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgIH0sXG4gICAgICAgIGFkZFJlZmVyZW5jZTogZnVuY3Rpb24gKG5hbWUsIG1vZGVsLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBnZXR0ZXIgPSBvcHRpb25zLmdldHRlciB8fCAnZ2V0JyArIG5hbWVbMF0udG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgICB2YXIgc2V0dGVyID0gb3B0aW9ucy5zZXR0ZXIgfHwgJ3NldCcgKyBuYW1lWzBdLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICAgICAgICAgICAgdmFyIGZpZWxkID0gb3B0aW9ucy5maWVsZCB8fCBzLnVuZGVyc2NvcmVkKG5hbWUpICsgJ19pZCc7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgZ2V0dGVyICYgc2V0dGVyIG1ldGhvZHNcbiAgICAgICAgICAgIHNlbGZbZ2V0dGVyXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXNlbGYucmVmZXJlbmNlc1tuYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5yZXZlcnNlTG9va3VwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVmID0gbmV3IG1vZGVsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWYudXJsUm9vdCA9IHRoaXMudXJsKCkgKyAnLycgKyBuYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW25hbWVdID0gcmVmO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW5pdGlhbGl6ZSB3aXRoIGxvYWRlZCBwcm9wZXJ0aWVzXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcHJvcHMgPSBfLmV4dGVuZCh7aWQ6IHNlbGYuZ2V0KGZpZWxkKX0sIHNlbGYuZ2V0KG5hbWUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tuYW1lXSA9IG5ldyBtb2RlbChwcm9wcyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYucmVmZXJlbmNlc1tuYW1lXTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZWxmW3NldHRlcl0gPSBmdW5jdGlvbiAocmVjb3JkKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW25hbWVdID0gcmVjb3JkO1xuICAgICAgICAgICAgICAgIHNlbGYuc2V0KGZpZWxkLCByZWNvcmQgPyByZWNvcmQuZ2V0KCdpZCcpIDogbnVsbCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgICBjbGVhclJlZmVyZW5jZTogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlZmVyZW5jZXNbbmFtZV07XG4gICAgICAgIH0sXG4gICAgICAgIHVybDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuY29sbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIHZhciBpZCA9IHRoaXMuZ2V0KCdpZCcpO1xuICAgICAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLnVybCgpICsgJy8nICsgaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbi51cmwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUudXJsLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIHNjaGVtYTogdW5kZWZpbmVkLFxuICAgICAgICBjb2xsZWN0aW9uOiBvcmIuQ29sbGVjdGlvbixcbiAgICAgICAgYWxsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBzZWxlY3Q6IGZ1bmN0aW9uIChsb29rdXApIHtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gbmV3IHRoaXMuY29sbGVjdGlvbigpO1xuICAgICAgICAgICAgcmVjb3Jkcy5sb29rdXAgPSBfLmV4dGVuZCh7fSwgcmVjb3Jkcy5sb29rdXAsIGxvb2t1cCk7XG4gICAgICAgICAgICByZWNvcmRzLnVybFJvb3QgPSB0aGlzLnByb3RvdHlwZS51cmxSb290O1xuICAgICAgICAgICAgcmVjb3Jkcy5tb2RlbCA9IHRoaXM7XG4gICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgfSxcbiAgICAgICAgYnlJZDogZnVuY3Rpb24gKGlkLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBxID0gbmV3IG9yYi5RKCdpZCcpLmlzKGlkKTtcbiAgICAgICAgICAgIG9wdGlvbnMud2hlcmUgPSBxLmFuZChvcHRpb25zLndoZXJlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdCgpLmZldGNoT25lKG9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiKTsiLCIoZnVuY3Rpb24gKG9yYikge1xuICAgIC8vIGRlZmluZSB0aGUgYmFzZSBxdWVyeSB0eXBlXG4gICAgb3JiLlEgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICc9PScsXG4gICAgICAgICAgICBjb2x1bW46IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHRhYmxlOiAnJyxcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgICAgICAgZnVuY3Rpb25zOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBtYXRoOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBpbnZlcnRlZDogZmFsc2UsXG4gICAgICAgICAgICB2YWx1ZTogdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mKG9wdGlvbnMpID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdjb2x1bW4nLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdldCgnZnVuY3Rpb25zJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdmdW5jdGlvbnMnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ21hdGgnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ21hdGgnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFmdGVyOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQWZ0ZXIpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBhYnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5BYnMpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5BbmQsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYXNTdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkob3JiLlEuT3AuQXNTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmVmb3JlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmVmb3JlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmV0d2VlbjogZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmV0d2Vlbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIFthLCBiXSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjb250YWluczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Db250YWlucyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGNvcHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhdHRycyA9IF8uZXh0ZW5kKHt9LCB0aGlzLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgYXR0cnNbJ2Z1bmN0aW9ucyddID0gYXR0cnNbJ2Z1bmN0aW9ucyddLnNsaWNlKDApO1xuICAgICAgICAgICAgYXR0cnNbJ21hdGgnXSA9IGF0dHJzWydtYXRoJ10uc2xpY2UoMCk7XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RKGF0dHJzKTtcblxuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90Q29udGFpbjogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90Q29udGFpbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RFbmR3aXRoOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdEVuZHdpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90TWF0Y2g6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdE1hdGNoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdFN0YXJ0d2l0aDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RTdGFydHdpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBlbmRzd2l0aDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkVuZHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZ3JlYXRlclRoYW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuT3JFcXVhbDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkdyZWF0ZXJUaGFuT3JFcXVhbCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpc05vdDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90KTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMuZ2V0KCdjb2x1bW4nKSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQpO1xuICAgICAgICB9LFxuICAgICAgICBpc1VuZGVmaW5lZDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIG5vdEluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNOb3RJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxlc3NUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5MZXNzVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsb3dlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bmN0aW9uLkxvd2VyKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWF0Y2hlczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gdHJ1ZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLk1hdGNoZXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBtb2RpZnk6IGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICB0aGlzLmdldCgnZnVuY3Rpb25zJykucHVzaChmdW5jKTtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLk9yLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXJ0c3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5TdGFydHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncXVlcnknLFxuICAgICAgICAgICAgICAgIGNvbHVtbjogdGhpcy5nZXQoJ2NvbHVtbicpLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHZhbHVlOiB0aGlzLmdldCgndmFsdWUnKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIGZ1bmNzID0gdGhpcy5nZXQoJ2Z1bmN0aW9ucycpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkoZnVuY3MpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGpmdW5jcyA9IFtdO1xuICAgICAgICAgICAgICAgIF8uZWFjaChmdW5jcywgZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgICAgICAgICAgamZ1bmNzLnB1c2gob3JiLlEuRnVuY3Rpb24ua2V5KGZ1bmMpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLmZ1bmN0aW9ucyA9IGpmdW5jcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hdGggPSB0aGlzLmdldCgnbWF0aCcpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkobWF0aCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgam1hdGggPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2gobWF0aCwgZnVuY3Rpb24gKG9wKSB7XG4gICAgICAgICAgICAgICAgICAgIGptYXRoLnB1c2gob3JiLlEuTWF0aC5rZXkob3ApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLm1hdGggPSBqbWF0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgIH0sXG4gICAgICAgIHVwcGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVudGlvbnMuVXBwZXIpO1xuICAgICAgICB9XG4gICAgfSwge1xuICAgICAgICBPcDoge1xuICAgICAgICAgICAgSXM6ICc9PScsXG4gICAgICAgICAgICBJc05vdDogJyE9JyxcbiAgICAgICAgICAgIExlc3NUaGFuOiAnPCcsXG4gICAgICAgICAgICBMZXNzVGhhbk9yRXF1YWw6ICc8PScsXG4gICAgICAgICAgICBCZWZvcmU6ICc8JyxcbiAgICAgICAgICAgIEdyZWF0ZXJUaGFuOiAnPicsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbk9yRXF1YWw6ICc+PScsXG4gICAgICAgICAgICBBZnRlcjogJz4nLFxuICAgICAgICAgICAgQmV0d2VlbjogJ2JldHdlZW4nLFxuICAgICAgICAgICAgQ29udGFpbnM6ICdjb250YWlucycsXG4gICAgICAgICAgICBEb2VzTm90Q29udGFpbjogXCJkb2Vzbid0IGNvbnRhaW5cIixcbiAgICAgICAgICAgIFN0YXJ0c3dpdGg6ICdzdGFydHN3aXRoJyxcbiAgICAgICAgICAgIEVuZHN3aXRoOiAnZW5kc3dpdGgnLFxuICAgICAgICAgICAgTWF0Y2hlczogJ21hdGNoZXMnLFxuICAgICAgICAgICAgRG9lc05vdE1hdGNoOiBcImRvZXNuJ3QgbWF0Y2hcIixcbiAgICAgICAgICAgIElzSW46ICdpcyBpbicsXG4gICAgICAgICAgICBJc05vdEluOiAnaXMgbm90IGluJyxcbiAgICAgICAgICAgIERvZXNOb3RTdGFydHdpdGg6IFwiZG9lc24ndCBzdGFydHdpdGhcIixcbiAgICAgICAgICAgIERvZXNOb3RFbmR3aXRoOiBcImRvZXNuJ3QgZW5kd2l0aFwiLFxuICAgICAgICAgICAgQW5kOiAnYW5kJyxcbiAgICAgICAgICAgIE9yOiAnb3InLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgTWF0aDoge1xuICAgICAgICAgICAgQWRkOiAnKycsXG4gICAgICAgICAgICBTdWJ0cmFjdDogJy0nLFxuICAgICAgICAgICAgTXVsdGlwbHk6ICcqJyxcbiAgICAgICAgICAgIERpdmlkZTogJy8nLFxuICAgICAgICAgICAgQW5kOiAnJicsXG4gICAgICAgICAgICBPcjogJ3wnLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgRnVuY3Rpb246IHtcbiAgICAgICAgICAgIExvd2VyOiAnbG93ZXInLFxuICAgICAgICAgICAgVXBwZXI6ICd1cHBlcicsXG4gICAgICAgICAgICBBYnM6ICdhYnMnLFxuICAgICAgICAgICAgQXNTdHJpbmc6ICdzdHInLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLlFDb21wb3VuZCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBvcDogJ0FuZCdcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5xdWVyaWVzID0gb3B0aW9ucy5xdWVyaWVzIHx8IG5ldyBvcmIuQ29sbGVjdGlvbigpO1xuICAgICAgICB9LFxuICAgICAgICBhbmQ6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLkFuZCkge1xuICAgICAgICAgICAgICAgIHZhciBuZXdfcXVlcmllcyA9IHRoaXMucXVlcmllcy5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICBuZXdfcXVlcmllcy5wdXNoKG90aGVyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLkFuZCwgcXVlcmllczogbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oW3RoaXMsIG90aGVyXSl9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY29weTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgb3A6IHRoaXMuZ2V0KCdvcCcpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHRoaXMucXVlcmllcy5zbGljZSgwKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZChvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYW1fbnVsbCA9IHRydWU7XG4gICAgICAgICAgICBfLmVhY2godGhpcy5xdWVyaWVzLCBmdW5jdGlvbiAoc3VicXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN1YnF1ZXJ5LmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtX251bGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBhbV9udWxsO1xuICAgICAgICB9LFxuICAgICAgICBvcjogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdldCgnb3AnKSA9PT0gb3JiLlEuT3AuT3IpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLnF1ZXJpZXMuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuT3IsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBbdGhpcywgb3RoZXJdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY29tcG91bmQnLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHRoaXMucXVlcmllcy50b0pTT04oKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuSW5kZXggPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICBkYm5hbWU6ICcnLFxuICAgICAgICAgICAgdW5pcXVlOiBmYWxzZSxcbiAgICAgICAgICAgIG9yZGVyOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBjYWNoZWQ6IGZhbHNlLFxuICAgICAgICAgICAgdGltZW91dDogMFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbih7bW9kZWw6IG9yYi5Db2x1bW59KTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgZGJuYW1lOiB0aGlzLmdldCgnZGJuYW1lJyksXG4gICAgICAgICAgICAgICAgdW5pcXVlOiB0aGlzLmdldCgndW5pcXVlJyksXG4gICAgICAgICAgICAgICAgb3JkZXI6IHRoaXMuZ2V0KCdvcmRlcicpLFxuICAgICAgICAgICAgICAgIGNhY2hlZDogdGhpcy5nZXQoJ2NhY2hlZCcpLFxuICAgICAgICAgICAgICAgIHRpbWVvdXQ6IHRoaXMuZ2V0KCd0aW1lb3V0JylcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLlBpcGUgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICB0aHJvdWdoOiAnJyxcbiAgICAgICAgICAgIGZyb206ICcnLFxuICAgICAgICAgICAgdG86ICcnLFxuICAgICAgICAgICAgdW5pcXVlOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdGhpcy5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICB0aHJvdWdoOiB0aGlzLmdldCgndGhyb3VnaCcpLFxuICAgICAgICAgICAgICAgIGZyb206IHRoaXMuZ2V0KCdmcm9tJyksXG4gICAgICAgICAgICAgICAgdG86IHRoaXMuZ2V0KCd0bycpLFxuICAgICAgICAgICAgICAgIHVuaXF1ZTogdGhpcy5nZXQoJ3VuaXF1ZScpXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvcmIuQ29sdW1uID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZmllbGQ6ICcnLFxuICAgICAgICAgICAgZGlzcGxheTogJycsXG4gICAgICAgICAgICBpbmRleDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZmxhZ3M6IDAsXG4gICAgICAgICAgICBkZWZhdWx0OiB1bmRlZmluZWQsXG4gICAgICAgICAgICBkZWZhdWx0T3JkZXI6ICdhc2MnLFxuICAgICAgICAgICAgdHlwZTogJydcbiAgICAgICAgfSxcbiAgICAgICAgdGVzdEZsYWc6IGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgICAgICByZXR1cm4gKHNlbGYuZ2V0KCdmbGFncycpICYgZmxhZykgPiAwO1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMuZ2V0KCdpbmRleCcpO1xuICAgICAgICAgICAgdmFyIGluZGV4X2pzb24gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleF9qc29uID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBpbmRleC5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVkOiBpbmRleC5nZXQoJ2NhY2hlZCcpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiBpbmRleC5nZXQoJ3RpbWVvdXQnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiB0aGlzLmdldCgndHlwZScpLFxuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgZmllbGQ6IHRoaXMuZ2V0KCdmaWVsZCcpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgZmxhZ3M6IHRoaXMuZ2V0KCdmbGFncycpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogdGhpcy5nZXQoJ2RlZmF1bHRPcmRlcicpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHRoaXMuZ2V0KCdkZWZhdWx0JyksXG4gICAgICAgICAgICAgICAgaW5kZXg6IGluZGV4X2pzb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIEZsYWdzOiB7XG4gICAgICAgICAgICBSZWFkT25seTogICAgICAgTWF0aC5wb3coMiwgMCksXG4gICAgICAgICAgICBQcml2YXRlOiAgICAgICAgTWF0aC5wb3coMiwgMSksXG4gICAgICAgICAgICBQb2x5bW9ycGhpYzogICAgTWF0aC5wb3coMiwgMiksXG4gICAgICAgICAgICBQcmltYXJ5OiAgICAgICAgTWF0aC5wb3coMiwgMyksXG4gICAgICAgICAgICBBdXRvaW5jcmVtZW50OiAgTWF0aC5wb3coMiwgNCksXG4gICAgICAgICAgICBSZXF1aXJlZDogICAgICAgTWF0aC5wb3coMiwgNSksXG4gICAgICAgICAgICBVbmlxdWU6ICAgICAgICAgTWF0aC5wb3coMiwgNiksXG4gICAgICAgICAgICBFbmNyeXB0ZWQ6ICAgICAgTWF0aC5wb3coMiwgNyksXG4gICAgICAgICAgICBTZWFyY2hhYmxlOiAgICAgTWF0aC5wb3coMiwgOCksXG4gICAgICAgICAgICBUcmFuc2xhdGFibGU6ICAgTWF0aC5wb3coMiwgOSksXG4gICAgICAgICAgICBDYXNlU2Vuc2l0aXZlOiAgTWF0aC5wb3coMiwgMTApLFxuICAgICAgICAgICAgVmlydHVhbDogICAgICAgIE1hdGgucG93KDIsIDExKSxcbiAgICAgICAgICAgIFF1ZXJ5YWJsZTogICAgICBNYXRoLnBvdygyLCAxMilcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLlNjaGVtYSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBuYW1lOiAnJyxcbiAgICAgICAgICAgIGFic3RyYWN0OiBmYWxzZSxcbiAgICAgICAgICAgIGRibmFtZTogJycsXG4gICAgICAgICAgICBkaXNwbGF5OiAnJyxcbiAgICAgICAgICAgIGluaGVyaXRzOiAnJ1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbih7bW9kZWw6IG9yYi5Db2x1bW59KTtcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucy5jb21wYXJhdG9yID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgnbmFtZScpXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB0aGlzLmluZGV4ZXMgPSBuZXcgQmFja2JvbmUuQ29sbGVjdGlvbih7bW9kZWw6IG9yYi5JbmRleH0pO1xuICAgICAgICAgICAgdGhpcy5pbmRleGVzLmNvbXBhcmF0b3IgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbW9kZWwuZ2V0KCduYW1lJyk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB0aGlzLnBpcGVzID0gbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oe21vZGVsOiBvcmIuUGlwZX0pO1xuICAgICAgICAgICAgdGhpcy5waXBlcy5jb21wYXJhdG9yID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgnbmFtZScpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgYWJzdHJhY3Q6IHRoaXMuZ2V0KCdhYnN0cmFjdCcpLFxuICAgICAgICAgICAgICAgIGRibmFtZTogdGhpcy5nZXQoJ2RibmFtZScpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgaW5oZXJpdHM6IHRoaXMuZ2V0KCdpbmhlcml0cycpLFxuICAgICAgICAgICAgICAgIGNvbHVtbnM6IHRoaXMuY29sdW1ucy50b0pTT04oKSxcbiAgICAgICAgICAgICAgICBpbmRleGVzOiB0aGlzLmluZGV4ZXMudG9KU09OKCksXG4gICAgICAgICAgICAgICAgcGlwZXM6IHRoaXMucGlwZXMudG9KU09OKClcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIsIGpRdWVyeSk7Il19
