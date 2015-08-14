(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.orb = {};

require('./queries.js');
require('./recordset.js');
require('./schema.js');
require('./models.js');
},{"./models.js":2,"./queries.js":3,"./recordset.js":4,"./schema.js":5}],2:[function(require,module,exports){
(function (orb, $) {
    orb.Model = Backbone.Model.extend({
        schema: undefined,
        initialize: function (options) {
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

            // call the base class's method
            Backbone.Model.prototype.initialize.call(this, options);
        },
        addCollection: function (name, model, options) {
            options = options || {};
            var self = this;
            var records = model.select();
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
            var propname = '__' + name;

            // create the getter & setter methods
            self[getter] = function () {
                if (!self[propname]) {
                    if (options.reverseLookup) {
                        var ref = new model();
                        ref.urlRoot = this.url() + '/' + name;
                        self[propname] = ref;
                    } else {
                        // initialize with loaded properties
                        var props = self.get(name) || {id: self.get(field)};
                        self[propname] = new model(props);
                    }
                }
                return self[propname];
            };
            self[setter] = function (record) {
                self[propname] = record;
                self.set(field, record.get('id'));
            };
        },
        url: function () {
            if (this.collection) {
                return this.collection.url() + '/' + this.get('id');
            } else {
                return Backbone.Model.prototype.url.call(this);
            }
        }
    }, {
        collection: orb.RecordSet,
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
},{}],3:[function(require,module,exports){
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
        doesNotMatch: function (value, caseSensitive) {
            var caseSensitive = (caseSensitive === undefined) ? true : caseSensitive;
            var out = this.copy();
            out.set('op', orb.Q.Op.Matches);
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
            DoesNotContain: "doesn't match",
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
            op: 'And',
            queries: undefined
        },
        initialize: function (options) {
            if (this.get('queries') === undefined) {
                this.set('queries', []);
            }
        },
        and: function (other) {
            if (other === undefined || other.isNull()) {
                return this;
            } else if (this.isNull()) {
                return other;
            } else if (this.get('op') === orb.Q.Op.And) {
                var new_queries = this.get('queries').slice(0);
                new_queries.push(other);
                return new orb.QCompound({op: orb.Q.Op.And, queries: new_queries});
            } else {
                return new orb.QCompound({op: orb.Q.Op.And, queries: [this, other]});
            }
        },
        copy: function () {
            var options = {
                op: this.get('op'),
                queries: this.get('queries').slice(0)
            };
            return new orb.QCompound(options);
        },
        isNull: function () {
            var am_null = true;
            _.each(this.get('queries'), function (subquery) {
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
                var new_queries = this.get('queries').slice(0);
                new_queries.push(other);
                return new orb.QCompound({op: orb.Q.Op.Or, queries: new_queries});
            } else {
                return new orb.QCompound({op: orb.Q.Op.Or, queries: [this, other]});
            }
        },
        toJSON: function () {
            var query_json = [];
            _.each(this.get('queries'), function (query) {
                query_json.push(query.toJSON());
            });

            return {
                type: 'compound',
                op: orb.Q.Op.key(this.get('op')),
                queries: query_json
            };
        }
    });
})(window.orb);
},{}],4:[function(require,module,exports){
(function (orb, $) {
    orb.RecordSet = Backbone.Collection.extend({
        initialize: function () {
            this.lookup = {};
        },
        create: function (properties, options) {
            options.url = this.url();
            Backbone.Collection.prototype.create.call(properties, options);
        },
        copy: function () {
            var out = new this.constructor();
            out.urlRoot = this.urlRoot;
            out.model = this.model;
            out.lookup = _.extend({}, out.lookup);

            // create a copy of the where query
            if (out.lookup.where) {
                out.lookup.where = out.lookup.where.copy();
            }

            if (out.lookup.columns) {
                out.lookup.columns = out.lookup.columns.slice(0);
            }

            if (out.lookup.order && typeof(out.lookup.order) === 'object') {
                out.lookup.order = out.lookup.order.slice(0);
            }
            return out;
        },
        fetchCount: function (options) {
            return this.fetch(_.extend({}, options, {data: {returning: 'count'}}));
        },
        fetch: function (options) {
            var options = options || {};
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
            return this.fetch(opts);
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
},{}],5:[function(require,module,exports){
(function (orb, $) {
    orb.Schema = Backbone.Model.extend({

    });
})(window.orb, jQuery);
},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvbWFpbi5qcyIsInNyYy9tb2RlbHMuanMiLCJzcmMvcXVlcmllcy5qcyIsInNyYy9yZWNvcmRzZXQuanMiLCJzcmMvc2NoZW1hLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ3aW5kb3cub3JiID0ge307XG5cbnJlcXVpcmUoJy4vcXVlcmllcy5qcycpO1xucmVxdWlyZSgnLi9yZWNvcmRzZXQuanMnKTtcbnJlcXVpcmUoJy4vc2NoZW1hLmpzJyk7XG5yZXF1aXJlKCcuL21vZGVscy5qcycpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLk1vZGVsID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgc2NoZW1hOiB1bmRlZmluZWQsXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICAvLyBzZXR1cCBkZWZhdWx0cyBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gICAgICAgICAgICBpZiAodGhpcy5zY2hlbWEpIHtcbiAgICAgICAgICAgICAgICB2YXIgZGVmYXVsdHMgPSB7fTtcbiAgICAgICAgICAgICAgICBfLmVhY2godGhpcy5zY2hlbWEuY29sdW1ucyB8fCBbXSwgZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sdW1uLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHNbY29sdW1uLmZpZWxkXSA9IGNvbHVtbi5kZWZhdWx0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IF8uZXh0ZW5kKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjbGFzcydzIG1ldGhvZFxuICAgICAgICAgICAgQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgYWRkQ29sbGVjdGlvbjogZnVuY3Rpb24gKG5hbWUsIG1vZGVsLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gbW9kZWwuc2VsZWN0KCk7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy51cmxSb290KSB7XG4gICAgICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gb3B0aW9ucy51cmxSb290O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWNvcmRzLnVybFJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzLnJ0cmltKHNlbGYudXJsUm9vdCwgJy8nKSArICcvJyArIHNlbGYuZ2V0KCdpZCcpICsgJy8nICsgKG9wdGlvbnMudXJsU3VmZml4IHx8IG5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXNbbmFtZV0gPSByZWNvcmRzO1xuICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgIH0sXG4gICAgICAgIGFkZFJlZmVyZW5jZTogZnVuY3Rpb24gKG5hbWUsIG1vZGVsLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIHZhciBnZXR0ZXIgPSBvcHRpb25zLmdldHRlciB8fCAnZ2V0JyArIG5hbWVbMF0udG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgICB2YXIgc2V0dGVyID0gb3B0aW9ucy5zZXR0ZXIgfHwgJ3NldCcgKyBuYW1lWzBdLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICAgICAgICAgICAgdmFyIGZpZWxkID0gb3B0aW9ucy5maWVsZCB8fCBzLnVuZGVyc2NvcmVkKG5hbWUpICsgJ19pZCc7XG4gICAgICAgICAgICB2YXIgcHJvcG5hbWUgPSAnX18nICsgbmFtZTtcblxuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSBnZXR0ZXIgJiBzZXR0ZXIgbWV0aG9kc1xuICAgICAgICAgICAgc2VsZltnZXR0ZXJdID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICghc2VsZltwcm9wbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMucmV2ZXJzZUxvb2t1cCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlZiA9IG5ldyBtb2RlbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVmLnVybFJvb3QgPSB0aGlzLnVybCgpICsgJy8nICsgbmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGZbcHJvcG5hbWVdID0gcmVmO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW5pdGlhbGl6ZSB3aXRoIGxvYWRlZCBwcm9wZXJ0aWVzXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcHJvcHMgPSBzZWxmLmdldChuYW1lKSB8fCB7aWQ6IHNlbGYuZ2V0KGZpZWxkKX07XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmW3Byb3BuYW1lXSA9IG5ldyBtb2RlbChwcm9wcyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGZbcHJvcG5hbWVdO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHNlbGZbc2V0dGVyXSA9IGZ1bmN0aW9uIChyZWNvcmQpIHtcbiAgICAgICAgICAgICAgICBzZWxmW3Byb3BuYW1lXSA9IHJlY29yZDtcbiAgICAgICAgICAgICAgICBzZWxmLnNldChmaWVsZCwgcmVjb3JkLmdldCgnaWQnKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgICB1cmw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLnVybCgpICsgJy8nICsgdGhpcy5nZXQoJ2lkJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUudXJsLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIGNvbGxlY3Rpb246IG9yYi5SZWNvcmRTZXQsXG4gICAgICAgIGFsbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdChvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0OiBmdW5jdGlvbiAobG9va3VwKSB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IG5ldyB0aGlzLmNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgIHJlY29yZHMubG9va3VwID0gXy5leHRlbmQoe30sIHJlY29yZHMubG9va3VwLCBsb29rdXApO1xuICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gdGhpcy5wcm90b3R5cGUudXJsUm9vdDtcbiAgICAgICAgICAgIHJlY29yZHMubW9kZWwgPSB0aGlzO1xuICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgIH0sXG4gICAgICAgIGJ5SWQ6IGZ1bmN0aW9uIChpZCwgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgcSA9IG5ldyBvcmIuUSgnaWQnKS5pcyhpZCk7XG4gICAgICAgICAgICBvcHRpb25zLndoZXJlID0gcS5hbmQob3B0aW9ucy53aGVyZSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoKS5mZXRjaE9uZShvcHRpb25zKTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7IiwiKGZ1bmN0aW9uIChvcmIpIHtcbiAgICAvLyBkZWZpbmUgdGhlIGJhc2UgcXVlcnkgdHlwZVxuICAgIG9yYi5RID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG9wOiAnPT0nLFxuICAgICAgICAgICAgY29sdW1uOiB1bmRlZmluZWQsXG4gICAgICAgICAgICB0YWJsZTogJycsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiBmYWxzZSxcbiAgICAgICAgICAgIGZ1bmN0aW9uczogdW5kZWZpbmVkLFxuICAgICAgICAgICAgbWF0aDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgaW52ZXJ0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgdmFsdWU6IHVuZGVmaW5lZFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZihvcHRpb25zKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnY29sdW1uJywgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ2Z1bmN0aW9ucycpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnZnVuY3Rpb25zJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KCdtYXRoJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdtYXRoJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhZnRlcjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkFmdGVyKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYWJzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVuY3Rpb24uQWJzKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGFuZDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe1xuICAgICAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3AuQW5kLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFzU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KG9yYi5RLk9wLkFzU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJlZm9yZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJlZm9yZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJldHdlZW46IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJldHdlZW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCBbYSwgYl0pO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgY29udGFpbnM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQ29udGFpbnMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXR0cnMgPSBfLmV4dGVuZCh7fSwgdGhpcy5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGF0dHJzWydmdW5jdGlvbnMnXSA9IGF0dHJzWydmdW5jdGlvbnMnXS5zbGljZSgwKTtcbiAgICAgICAgICAgIGF0dHJzWydtYXRoJ10gPSBhdHRyc1snbWF0aCddLnNsaWNlKDApO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUShhdHRycyk7XG5cbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdENvbnRhaW46IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdENvbnRhaW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90TWF0Y2g6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IHRydWUgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5NYXRjaGVzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZW5kc3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5FbmRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuR3JlYXRlclRoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBncmVhdGVyVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpczogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOb3Q6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc05vdCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLmdldCgnY29sdW1uJykgPT09IHVuZGVmaW5lZCB8fCB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNVbmRlZmluZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgICBpbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzSW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBub3RJbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90SW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkxlc3NUaGFuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbGVzc1RoYW5PckVxdWFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW5PckVxdWFsKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbG93ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5Mb3dlcik7XG4gICAgICAgIH0sXG4gICAgICAgIG1hdGNoZXM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IHRydWUgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5NYXRjaGVzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbW9kaWZ5OiBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgdGhpcy5nZXQoJ2Z1bmN0aW9ucycpLnB1c2goZnVuYyk7XG4gICAgICAgIH0sXG4gICAgICAgIG9yOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5PcixcbiAgICAgICAgICAgICAgICAgICAgcXVlcmllczogW3RoaXMsIG90aGVyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBzdGFydHN3aXRoOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuU3RhcnRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3F1ZXJ5JyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0KCdjb2x1bW4nKSxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdGhpcy5nZXQoJ3ZhbHVlJylcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBmdW5jcyA9IHRoaXMuZ2V0KCdmdW5jdGlvbnMnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGZ1bmNzKSkge1xuICAgICAgICAgICAgICAgIHZhciBqZnVuY3MgPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2goZnVuY3MsIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIGpmdW5jcy5wdXNoKG9yYi5RLkZ1bmN0aW9uLmtleShmdW5jKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5mdW5jdGlvbnMgPSBqZnVuY3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXRoID0gdGhpcy5nZXQoJ21hdGgnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KG1hdGgpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGptYXRoID0gW107XG4gICAgICAgICAgICAgICAgXy5lYWNoKG1hdGgsIGZ1bmN0aW9uIChvcCkge1xuICAgICAgICAgICAgICAgICAgICBqbWF0aC5wdXNoKG9yYi5RLk1hdGgua2V5KG9wKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5tYXRoID0gam1hdGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgICB9LFxuICAgICAgICB1cHBlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bnRpb25zLlVwcGVyKTtcbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgT3A6IHtcbiAgICAgICAgICAgIElzOiAnPT0nLFxuICAgICAgICAgICAgSXNOb3Q6ICchPScsXG4gICAgICAgICAgICBMZXNzVGhhbjogJzwnLFxuICAgICAgICAgICAgTGVzc1RoYW5PckVxdWFsOiAnPD0nLFxuICAgICAgICAgICAgQmVmb3JlOiAnPCcsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbjogJz4nLFxuICAgICAgICAgICAgR3JlYXRlclRoYW5PckVxdWFsOiAnPj0nLFxuICAgICAgICAgICAgQWZ0ZXI6ICc+JyxcbiAgICAgICAgICAgIEJldHdlZW46ICdiZXR3ZWVuJyxcbiAgICAgICAgICAgIENvbnRhaW5zOiAnY29udGFpbnMnLFxuICAgICAgICAgICAgRG9lc05vdENvbnRhaW46IFwiZG9lc24ndCBtYXRjaFwiLFxuICAgICAgICAgICAgU3RhcnRzd2l0aDogJ3N0YXJ0c3dpdGgnLFxuICAgICAgICAgICAgRW5kc3dpdGg6ICdlbmRzd2l0aCcsXG4gICAgICAgICAgICBNYXRjaGVzOiAnbWF0Y2hlcycsXG4gICAgICAgICAgICBEb2VzTm90TWF0Y2g6IFwiZG9lc24ndCBtYXRjaFwiLFxuICAgICAgICAgICAgSXNJbjogJ2lzIGluJyxcbiAgICAgICAgICAgIElzTm90SW46ICdpcyBub3QgaW4nLFxuICAgICAgICAgICAgRG9lc05vdFN0YXJ0d2l0aDogXCJkb2Vzbid0IHN0YXJ0d2l0aFwiLFxuICAgICAgICAgICAgRG9lc05vdEVuZHdpdGg6IFwiZG9lc24ndCBlbmR3aXRoXCIsXG4gICAgICAgICAgICBBbmQ6ICdhbmQnLFxuICAgICAgICAgICAgT3I6ICdvcicsXG5cbiAgICAgICAgICAgIGtleTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmZpbmQodGhpcywgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4ga2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBNYXRoOiB7XG4gICAgICAgICAgICBBZGQ6ICcrJyxcbiAgICAgICAgICAgIFN1YnRyYWN0OiAnLScsXG4gICAgICAgICAgICBNdWx0aXBseTogJyonLFxuICAgICAgICAgICAgRGl2aWRlOiAnLycsXG4gICAgICAgICAgICBBbmQ6ICcmJyxcbiAgICAgICAgICAgIE9yOiAnfCcsXG5cbiAgICAgICAgICAgIGtleTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmZpbmQodGhpcywgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4ga2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBGdW5jdGlvbjoge1xuICAgICAgICAgICAgTG93ZXI6ICdsb3dlcicsXG4gICAgICAgICAgICBVcHBlcjogJ3VwcGVyJyxcbiAgICAgICAgICAgIEFiczogJ2FicycsXG4gICAgICAgICAgICBBc1N0cmluZzogJ3N0cicsXG5cbiAgICAgICAgICAgIGtleTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBfLmZpbmQodGhpcywgZnVuY3Rpb24gKHYsIGspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYgPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4ga2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvcmIuUUNvbXBvdW5kID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG9wOiAnQW5kJyxcbiAgICAgICAgICAgIHF1ZXJpZXM6IHVuZGVmaW5lZFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KCdxdWVyaWVzJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdxdWVyaWVzJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhbmQ6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLkFuZCkge1xuICAgICAgICAgICAgICAgIHZhciBuZXdfcXVlcmllcyA9IHRoaXMuZ2V0KCdxdWVyaWVzJykuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuQW5kLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl19KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY29weTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgb3A6IHRoaXMuZ2V0KCdvcCcpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHRoaXMuZ2V0KCdxdWVyaWVzJykuc2xpY2UoMClcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFtX251bGwgPSB0cnVlO1xuICAgICAgICAgICAgXy5lYWNoKHRoaXMuZ2V0KCdxdWVyaWVzJyksIGZ1bmN0aW9uIChzdWJxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmICghc3VicXVlcnkuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgYW1fbnVsbCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGFtX251bGw7XG4gICAgICAgIH0sXG4gICAgICAgIG9yOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2V0KCdvcCcpID09PSBvcmIuUS5PcC5Pcikge1xuICAgICAgICAgICAgICAgIHZhciBuZXdfcXVlcmllcyA9IHRoaXMuZ2V0KCdxdWVyaWVzJykuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuT3IsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBbdGhpcywgb3RoZXJdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHF1ZXJ5X2pzb24gPSBbXTtcbiAgICAgICAgICAgIF8uZWFjaCh0aGlzLmdldCgncXVlcmllcycpLCBmdW5jdGlvbiAocXVlcnkpIHtcbiAgICAgICAgICAgICAgICBxdWVyeV9qc29uLnB1c2gocXVlcnkudG9KU09OKCkpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2NvbXBvdW5kJyxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiBxdWVyeV9qc29uXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiKTsiLCIoZnVuY3Rpb24gKG9yYiwgJCkge1xuICAgIG9yYi5SZWNvcmRTZXQgPSBCYWNrYm9uZS5Db2xsZWN0aW9uLmV4dGVuZCh7XG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMubG9va3VwID0ge307XG4gICAgICAgIH0sXG4gICAgICAgIGNyZWF0ZTogZnVuY3Rpb24gKHByb3BlcnRpZXMsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMudXJsID0gdGhpcy51cmwoKTtcbiAgICAgICAgICAgIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmNyZWF0ZS5jYWxsKHByb3BlcnRpZXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gbmV3IHRoaXMuY29uc3RydWN0b3IoKTtcbiAgICAgICAgICAgIG91dC51cmxSb290ID0gdGhpcy51cmxSb290O1xuICAgICAgICAgICAgb3V0Lm1vZGVsID0gdGhpcy5tb2RlbDtcbiAgICAgICAgICAgIG91dC5sb29rdXAgPSBfLmV4dGVuZCh7fSwgb3V0Lmxvb2t1cCk7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIGNvcHkgb2YgdGhlIHdoZXJlIHF1ZXJ5XG4gICAgICAgICAgICBpZiAob3V0Lmxvb2t1cC53aGVyZSkge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAud2hlcmUgPSBvdXQubG9va3VwLndoZXJlLmNvcHkoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAuY29sdW1ucykge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAuY29sdW1ucyA9IG91dC5sb29rdXAuY29sdW1ucy5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAub3JkZXIgJiYgdHlwZW9mKG91dC5sb29rdXAub3JkZXIpID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAub3JkZXIgPSBvdXQubG9va3VwLm9yZGVyLnNsaWNlKDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZmV0Y2hDb3VudDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZldGNoKF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7ZGF0YToge3JldHVybmluZzogJ2NvdW50J319KSk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIGxvb2t1cCA9IHt9O1xuXG4gICAgICAgICAgICAvLyBzZXR1cCB0aGUgd2hlcmUgcXVlcnlcbiAgICAgICAgICAgIHZhciB3aGVyZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICh0aGlzLmxvb2t1cC53aGVyZSkge1xuICAgICAgICAgICAgICAgIHdoZXJlID0gdGhpcy5sb29rdXAud2hlcmUuYW5kKG9wdGlvbnMud2hlcmUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvcHRpb25zLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgd2hlcmUgPSBvcHRpb25zLndoZXJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdoZXJlICYmICF3aGVyZS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIGxvb2t1cC53aGVyZSA9IHdoZXJlLnRvSlNPTigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXR1cCB0aGUgcmVzdCBvZiB0aGUgbG9va3VwIG9wdGlvbnNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmxpbWl0IHx8IHRoaXMubG9va3VwLmxpbWl0KSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLmxpbWl0ID0gb3B0aW9ucy5saW1pdCB8fCB0aGlzLmxvb2t1cC5saW1pdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvcHRpb25zLm9yZGVyIHx8IHRoaXMubG9va3VwLm9yZGVyKSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLm9yZGVyID0gb3B0aW9ucy5vcmRlciB8fCB0aGlzLmxvb2t1cC5vcmRlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvcHRpb25zLmV4cGFuZCB8fCB0aGlzLmxvb2t1cC5leHBhbmQpIHtcbiAgICAgICAgICAgICAgICBsb29rdXAuZXhwYW5kID0gb3B0aW9ucy5leHBhbmQgfHwgdGhpcy5sb29rdXAuZXhwYW5kO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGxvb2t1cCBzcGVjaWZpYyBvcHRpb25zLCB1cGRhdGUgdGhlIHJvb3QgcXVlcnlcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGxvb2t1cCkpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSBfLmV4dGVuZCh7bG9va3VwOiBKU09OLnN0cmluZ2lmeShsb29rdXApfSwgb3B0aW9ucy5kYXRhKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjb2xsZWN0aW9uIGxvb2t1cCBjb21tYW5kc1xuICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmZldGNoLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoT25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgb3B0cyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgbGltaXQ6IDEsXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rpb24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5zdWNjZXNzKGNvbGxlY3Rpb24uYXQoMCksIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3ModW5kZWZpbmVkLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmV0Y2gob3B0cyk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlZmluZTogZnVuY3Rpb24gKGxvb2t1cCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuXG4gICAgICAgICAgICAvLyBtZXJnZSB0aGUgd2hlcmUgbG9va3Vwc1xuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQubG9va3VwLndoZXJlID0gb3V0Lmxvb2t1cC53aGVyZS5hbmQobG9va3VwLndoZXJlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobG9va3VwLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC53aGVyZSA9IGxvb2t1cC53aGVyZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSB3aGVyZSBvcHRpb25cbiAgICAgICAgICAgIGRlbGV0ZSBsb29rdXAud2hlcmU7XG5cbiAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIG90aGVyIG9wdGlvbnNcbiAgICAgICAgICAgIG91dC5sb29rdXAgPSBfLmV4dGVuZChvdXQubG9va3VwLCBsb29rdXApXG5cbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIHVybDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHVybCA9ICh0eXBlb2YodGhpcy51cmxSb290KSA9PT0gJ3N0cmluZycpID8gdGhpcy51cmxSb290IDogdGhpcy51cmxSb290KCk7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29rdXAudmlldykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzLnJ0cmltKHVybCwgJy8nKSArICcvJyArIHRoaXMubG9va3VwLnZpZXc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB1cmw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIsIGpRdWVyeSk7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuU2NoZW1hID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcblxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiXX0=
