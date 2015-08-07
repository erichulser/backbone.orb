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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvbWFpbi5qcyIsInNyYy9tb2RlbHMuanMiLCJzcmMvcXVlcmllcy5qcyIsInNyYy9yZWNvcmRzZXQuanMiLCJzcmMvc2NoZW1hLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwid2luZG93Lm9yYiA9IHt9O1xuXG5yZXF1aXJlKCcuL3F1ZXJpZXMuanMnKTtcbnJlcXVpcmUoJy4vcmVjb3Jkc2V0LmpzJyk7XG5yZXF1aXJlKCcuL3NjaGVtYS5qcycpO1xucmVxdWlyZSgnLi9tb2RlbHMuanMnKTsiLCIoZnVuY3Rpb24gKG9yYiwgJCkge1xuICAgIG9yYi5Nb2RlbCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIHNjaGVtYTogdW5kZWZpbmVkLFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgLy8gc2V0dXAgZGVmYXVsdHMgYmFzZWQgb24gdGhlIHNjaGVtYVxuICAgICAgICAgICAgaWYgKHRoaXMuc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlZmF1bHRzID0ge307XG4gICAgICAgICAgICAgICAgXy5lYWNoKHRoaXMuc2NoZW1hLmNvbHVtbnMgfHwgW10sIGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi5kZWZhdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRzW2NvbHVtbi5maWVsZF0gPSBjb2x1bW4uZGVmYXVsdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBfLmV4dGVuZChkZWZhdWx0cywgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNhbGwgdGhlIGJhc2UgY2xhc3MncyBtZXRob2RcbiAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGFkZENvbGxlY3Rpb246IGZ1bmN0aW9uIChuYW1lLCBtb2RlbCwgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IG1vZGVsLnNlbGVjdCgpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMudXJsUm9vdCkge1xuICAgICAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IG9wdGlvbnMudXJsUm9vdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcy5ydHJpbShzZWxmLnVybFJvb3QsICcvJykgKyAnLycgKyBzZWxmLmdldCgnaWQnKSArICcvJyArIChvcHRpb25zLnVybFN1ZmZpeCB8fCBuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzW25hbWVdID0gcmVjb3JkcztcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzO1xuICAgICAgICB9LFxuICAgICAgICBhZGRSZWZlcmVuY2U6IGZ1bmN0aW9uIChuYW1lLCBtb2RlbCwgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgZ2V0dGVyID0gb3B0aW9ucy5nZXR0ZXIgfHwgJ2dldCcgKyBuYW1lWzBdLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICAgICAgICAgICAgdmFyIHNldHRlciA9IG9wdGlvbnMuc2V0dGVyIHx8ICdzZXQnICsgbmFtZVswXS50b1VwcGVyQ2FzZSgpICsgbmFtZS5zbGljZSgxKTtcbiAgICAgICAgICAgIHZhciBmaWVsZCA9IG9wdGlvbnMuZmllbGQgfHwgcy51bmRlcnNjb3JlZChuYW1lKSArICdfaWQnO1xuICAgICAgICAgICAgdmFyIHByb3BuYW1lID0gJ19fJyArIG5hbWU7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgZ2V0dGVyICYgc2V0dGVyIG1ldGhvZHNcbiAgICAgICAgICAgIHNlbGZbZ2V0dGVyXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXNlbGZbcHJvcG5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnJldmVyc2VMb29rdXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWYgPSBuZXcgbW9kZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZi51cmxSb290ID0gdGhpcy51cmwoKSArICcvJyArIG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmW3Byb3BuYW1lXSA9IHJlZjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemUgd2l0aCBsb2FkZWQgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHByb3BzID0gc2VsZi5nZXQobmFtZSkgfHwge2lkOiBzZWxmLmdldChmaWVsZCl9O1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZltwcm9wbmFtZV0gPSBuZXcgbW9kZWwocHJvcHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmW3Byb3BuYW1lXTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZWxmW3NldHRlcl0gPSBmdW5jdGlvbiAocmVjb3JkKSB7XG4gICAgICAgICAgICAgICAgc2VsZltwcm9wbmFtZV0gPSByZWNvcmQ7XG4gICAgICAgICAgICAgICAgc2VsZi5zZXQoZmllbGQsIHJlY29yZC5nZXQoJ2lkJykpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbi51cmwoKSArICcvJyArIHRoaXMuZ2V0KCdpZCcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnVybC5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSwge1xuICAgICAgICBjb2xsZWN0aW9uOiBvcmIuUmVjb3JkU2V0LFxuICAgICAgICBhbGw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Qob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdDogZnVuY3Rpb24gKGxvb2t1cCkge1xuICAgICAgICAgICAgdmFyIHJlY29yZHMgPSBuZXcgdGhpcy5jb2xsZWN0aW9uKCk7XG4gICAgICAgICAgICByZWNvcmRzLmxvb2t1cCA9IF8uZXh0ZW5kKHt9LCByZWNvcmRzLmxvb2t1cCwgbG9va3VwKTtcbiAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IHRoaXMucHJvdG90eXBlLnVybFJvb3Q7XG4gICAgICAgICAgICByZWNvcmRzLm1vZGVsID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzO1xuICAgICAgICB9LFxuICAgICAgICBieUlkOiBmdW5jdGlvbiAoaWQsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIHEgPSBuZXcgb3JiLlEoJ2lkJykuaXMoaWQpO1xuICAgICAgICAgICAgb3B0aW9ucy53aGVyZSA9IHEuYW5kKG9wdGlvbnMud2hlcmUpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KCkuZmV0Y2hPbmUob3B0aW9ucyk7XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpOyIsIihmdW5jdGlvbiAob3JiKSB7XG4gICAgLy8gZGVmaW5lIHRoZSBiYXNlIHF1ZXJ5IHR5cGVcbiAgICBvcmIuUSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBvcDogJz09JyxcbiAgICAgICAgICAgIGNvbHVtbjogdW5kZWZpbmVkLFxuICAgICAgICAgICAgdGFibGU6ICcnLFxuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZTogZmFsc2UsXG4gICAgICAgICAgICBmdW5jdGlvbnM6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIG1hdGg6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGludmVydGVkOiBmYWxzZSxcbiAgICAgICAgICAgIHZhbHVlOiB1bmRlZmluZWRcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Yob3B0aW9ucykgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ2NvbHVtbicsIG9wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KCdmdW5jdGlvbnMnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ2Z1bmN0aW9ucycsIFtdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdldCgnbWF0aCcpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnbWF0aCcsIFtdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYWZ0ZXI6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5BZnRlcik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGFiczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bmN0aW9uLkFicyk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBhbmQ6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLkFuZCxcbiAgICAgICAgICAgICAgICAgICAgcXVlcmllczogW3RoaXMsIG90aGVyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhc1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeShvcmIuUS5PcC5Bc1N0cmluZyk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBiZWZvcmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5CZWZvcmUpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBiZXR3ZWVuOiBmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5CZXR3ZWVuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgW2EsIGJdKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRhaW5zOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkNvbnRhaW5zKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgY29weTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGF0dHJzID0gXy5leHRlbmQoe30sIHRoaXMuYXR0cmlidXRlcyk7XG4gICAgICAgICAgICBhdHRyc1snZnVuY3Rpb25zJ10gPSBhdHRyc1snZnVuY3Rpb25zJ10uc2xpY2UoMCk7XG4gICAgICAgICAgICBhdHRyc1snbWF0aCddID0gYXR0cnNbJ21hdGgnXS5zbGljZSgwKTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlEoYXR0cnMpO1xuXG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RDb250YWluOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RDb250YWluKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdE1hdGNoOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyB0cnVlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTWF0Y2hlcyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGVuZHN3aXRoOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRW5kc3dpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBncmVhdGVyVGhhbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkdyZWF0ZXJUaGFuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZ3JlYXRlclRoYW5PckVxdWFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuR3JlYXRlclRoYW5PckVxdWFsKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXM6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jcyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTm90OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNOb3QpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpc051bGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy5nZXQoJ2NvbHVtbicpID09PSB1bmRlZmluZWQgfHwgdGhpcy5nZXQoJ3ZhbHVlJykgPT09IHVuZGVmaW5lZCk7XG4gICAgICAgIH0sXG4gICAgICAgIGlzVW5kZWZpbmVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXQoJ3ZhbHVlJykgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICAgICAgaW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc0luKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbm90SW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc05vdEluKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbGVzc1RoYW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5MZXNzVGhhbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxlc3NUaGFuT3JFcXVhbDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkxlc3NUaGFuT3JFcXVhbCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxvd2VyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVuY3Rpb24uTG93ZXIpO1xuICAgICAgICB9LFxuICAgICAgICBtYXRjaGVzOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyB0cnVlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTWF0Y2hlcyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIG1vZGlmeTogZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgIHRoaXMuZ2V0KCdmdW5jdGlvbnMnKS5wdXNoKGZ1bmMpO1xuICAgICAgICB9LFxuICAgICAgICBvcjogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe1xuICAgICAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3AuT3IsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgc3RhcnRzd2l0aDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLlN0YXJ0c3dpdGgpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdxdWVyeScsXG4gICAgICAgICAgICAgICAgY29sdW1uOiB0aGlzLmdldCgnY29sdW1uJyksXG4gICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLmtleSh0aGlzLmdldCgnb3AnKSksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHRoaXMuZ2V0KCd2YWx1ZScpXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgZnVuY3MgPSB0aGlzLmdldCgnZnVuY3Rpb25zJyk7XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShmdW5jcykpIHtcbiAgICAgICAgICAgICAgICB2YXIgamZ1bmNzID0gW107XG4gICAgICAgICAgICAgICAgXy5lYWNoKGZ1bmNzLCBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgICAgICAgICBqZnVuY3MucHVzaChvcmIuUS5GdW5jdGlvbi5rZXkoZnVuYykpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGRhdGEuZnVuY3Rpb25zID0gamZ1bmNzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbWF0aCA9IHRoaXMuZ2V0KCdtYXRoJyk7XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShtYXRoKSkge1xuICAgICAgICAgICAgICAgIHZhciBqbWF0aCA9IFtdO1xuICAgICAgICAgICAgICAgIF8uZWFjaChtYXRoLCBmdW5jdGlvbiAob3ApIHtcbiAgICAgICAgICAgICAgICAgICAgam1hdGgucHVzaChvcmIuUS5NYXRoLmtleShvcCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGRhdGEubWF0aCA9IGptYXRoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgICAgfSxcbiAgICAgICAgdXBwZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW50aW9ucy5VcHBlcik7XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIE9wOiB7XG4gICAgICAgICAgICBJczogJz09JyxcbiAgICAgICAgICAgIElzTm90OiAnIT0nLFxuICAgICAgICAgICAgTGVzc1RoYW46ICc8JyxcbiAgICAgICAgICAgIExlc3NUaGFuT3JFcXVhbDogJzw9JyxcbiAgICAgICAgICAgIEJlZm9yZTogJzwnLFxuICAgICAgICAgICAgR3JlYXRlclRoYW46ICc+JyxcbiAgICAgICAgICAgIEdyZWF0ZXJUaGFuT3JFcXVhbDogJz49JyxcbiAgICAgICAgICAgIEFmdGVyOiAnPicsXG4gICAgICAgICAgICBCZXR3ZWVuOiAnYmV0d2VlbicsXG4gICAgICAgICAgICBDb250YWluczogJ2NvbnRhaW5zJyxcbiAgICAgICAgICAgIERvZXNOb3RDb250YWluOiBcImRvZXNuJ3QgbWF0Y2hcIixcbiAgICAgICAgICAgIFN0YXJ0c3dpdGg6ICdzdGFydHN3aXRoJyxcbiAgICAgICAgICAgIEVuZHN3aXRoOiAnZW5kc3dpdGgnLFxuICAgICAgICAgICAgTWF0Y2hlczogJ21hdGNoZXMnLFxuICAgICAgICAgICAgRG9lc05vdE1hdGNoOiBcImRvZXNuJ3QgbWF0Y2hcIixcbiAgICAgICAgICAgIElzSW46ICdpcyBpbicsXG4gICAgICAgICAgICBJc05vdEluOiAnaXMgbm90IGluJyxcbiAgICAgICAgICAgIERvZXNOb3RTdGFydHdpdGg6IFwiZG9lc24ndCBzdGFydHdpdGhcIixcbiAgICAgICAgICAgIERvZXNOb3RFbmR3aXRoOiBcImRvZXNuJ3QgZW5kd2l0aFwiLFxuICAgICAgICAgICAgQW5kOiAnYW5kJyxcbiAgICAgICAgICAgIE9yOiAnb3InLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgTWF0aDoge1xuICAgICAgICAgICAgQWRkOiAnKycsXG4gICAgICAgICAgICBTdWJ0cmFjdDogJy0nLFxuICAgICAgICAgICAgTXVsdGlwbHk6ICcqJyxcbiAgICAgICAgICAgIERpdmlkZTogJy8nLFxuICAgICAgICAgICAgQW5kOiAnJicsXG4gICAgICAgICAgICBPcjogJ3wnLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgRnVuY3Rpb246IHtcbiAgICAgICAgICAgIExvd2VyOiAnbG93ZXInLFxuICAgICAgICAgICAgVXBwZXI6ICd1cHBlcicsXG4gICAgICAgICAgICBBYnM6ICdhYnMnLFxuICAgICAgICAgICAgQXNTdHJpbmc6ICdzdHInLFxuXG4gICAgICAgICAgICBrZXk6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5maW5kKHRoaXMsIGZ1bmN0aW9uICh2LCBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5ID0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLlFDb21wb3VuZCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBvcDogJ0FuZCcsXG4gICAgICAgICAgICBxdWVyaWVzOiB1bmRlZmluZWRcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmdldCgncXVlcmllcycpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgncXVlcmllcycsIFtdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2V0KCdvcCcpID09PSBvcmIuUS5PcC5BbmQpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLmdldCgncXVlcmllcycpLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIG5ld19xdWVyaWVzLnB1c2gob3RoZXIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLkFuZCwgcXVlcmllczogbmV3X3F1ZXJpZXN9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuQW5kLCBxdWVyaWVzOiBbdGhpcywgb3RoZXJdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNvcHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIG9wOiB0aGlzLmdldCgnb3AnKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiB0aGlzLmdldCgncXVlcmllcycpLnNsaWNlKDApXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBpc051bGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhbV9udWxsID0gdHJ1ZTtcbiAgICAgICAgICAgIF8uZWFjaCh0aGlzLmdldCgncXVlcmllcycpLCBmdW5jdGlvbiAoc3VicXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN1YnF1ZXJ5LmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtX251bGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBhbV9udWxsO1xuICAgICAgICB9LFxuICAgICAgICBvcjogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdldCgnb3AnKSA9PT0gb3JiLlEuT3AuT3IpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLmdldCgncXVlcmllcycpLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIG5ld19xdWVyaWVzLnB1c2gob3RoZXIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5PciwgcXVlcmllczogW3RoaXMsIG90aGVyXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBxdWVyeV9qc29uID0gW107XG4gICAgICAgICAgICBfLmVhY2godGhpcy5nZXQoJ3F1ZXJpZXMnKSwgZnVuY3Rpb24gKHF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgcXVlcnlfanNvbi5wdXNoKHF1ZXJ5LnRvSlNPTigpKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdjb21wb3VuZCcsXG4gICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLmtleSh0aGlzLmdldCgnb3AnKSksXG4gICAgICAgICAgICAgICAgcXVlcmllczogcXVlcnlfanNvblxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuUmVjb3JkU2V0ID0gQmFja2JvbmUuQ29sbGVjdGlvbi5leHRlbmQoe1xuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmxvb2t1cCA9IHt9O1xuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gbmV3IHRoaXMuY29uc3RydWN0b3IoKTtcbiAgICAgICAgICAgIG91dC51cmxSb290ID0gdGhpcy51cmxSb290O1xuICAgICAgICAgICAgb3V0Lm1vZGVsID0gdGhpcy5tb2RlbDtcbiAgICAgICAgICAgIG91dC5sb29rdXAgPSBfLmV4dGVuZCh7fSwgb3V0Lmxvb2t1cCk7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIGNvcHkgb2YgdGhlIHdoZXJlIHF1ZXJ5XG4gICAgICAgICAgICBpZiAob3V0Lmxvb2t1cC53aGVyZSkge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAud2hlcmUgPSBvdXQubG9va3VwLndoZXJlLmNvcHkoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAuY29sdW1ucykge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAuY29sdW1ucyA9IG91dC5sb29rdXAuY29sdW1ucy5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAub3JkZXIgJiYgdHlwZW9mKG91dC5sb29rdXAub3JkZXIpID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAub3JkZXIgPSBvdXQubG9va3VwLm9yZGVyLnNsaWNlKDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZmV0Y2hDb3VudDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZldGNoKF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7ZGF0YToge3JldHVybmluZzogJ2NvdW50J319KSk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIGxvb2t1cCA9IHt9O1xuXG4gICAgICAgICAgICAvLyBzZXR1cCB0aGUgd2hlcmUgcXVlcnlcbiAgICAgICAgICAgIHZhciB3aGVyZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICh0aGlzLmxvb2t1cC53aGVyZSkge1xuICAgICAgICAgICAgICAgIHdoZXJlID0gdGhpcy5sb29rdXAud2hlcmUuYW5kKG9wdGlvbnMud2hlcmUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvcHRpb25zLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgd2hlcmUgPSBvcHRpb25zLndoZXJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdoZXJlICYmICF3aGVyZS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIGxvb2t1cC53aGVyZSA9IHdoZXJlLnRvSlNPTigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXR1cCB0aGUgcmVzdCBvZiB0aGUgbG9va3VwIG9wdGlvbnNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmxpbWl0IHx8IHRoaXMubG9va3VwLmxpbWl0KSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLmxpbWl0ID0gb3B0aW9ucy5saW1pdCB8fCB0aGlzLmxvb2t1cC5saW1pdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvcHRpb25zLm9yZGVyIHx8IHRoaXMubG9va3VwLm9yZGVyKSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLm9yZGVyID0gb3B0aW9ucy5vcmRlciB8fCB0aGlzLmxvb2t1cC5vcmRlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvcHRpb25zLmV4cGFuZCB8fCB0aGlzLmxvb2t1cC5leHBhbmQpIHtcbiAgICAgICAgICAgICAgICBsb29rdXAuZXhwYW5kID0gb3B0aW9ucy5leHBhbmQgfHwgdGhpcy5sb29rdXAuZXhwYW5kO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGxvb2t1cCBzcGVjaWZpYyBvcHRpb25zLCB1cGRhdGUgdGhlIHJvb3QgcXVlcnlcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGxvb2t1cCkpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSBfLmV4dGVuZCh7bG9va3VwOiBKU09OLnN0cmluZ2lmeShsb29rdXApfSwgb3B0aW9ucy5kYXRhKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjb2xsZWN0aW9uIGxvb2t1cCBjb21tYW5kc1xuICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLkNvbGxlY3Rpb24ucHJvdG90eXBlLmZldGNoLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoT25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgb3B0cyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgbGltaXQ6IDEsXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rpb24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5zdWNjZXNzKGNvbGxlY3Rpb24uYXQoMCksIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3ModW5kZWZpbmVkLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmV0Y2gob3B0cyk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlZmluZTogZnVuY3Rpb24gKGxvb2t1cCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuXG4gICAgICAgICAgICAvLyBtZXJnZSB0aGUgd2hlcmUgbG9va3Vwc1xuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQubG9va3VwLndoZXJlID0gb3V0Lmxvb2t1cC53aGVyZS5hbmQobG9va3VwLndoZXJlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobG9va3VwLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC53aGVyZSA9IGxvb2t1cC53aGVyZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSB3aGVyZSBvcHRpb25cbiAgICAgICAgICAgIGRlbGV0ZSBsb29rdXAud2hlcmU7XG5cbiAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIG90aGVyIG9wdGlvbnNcbiAgICAgICAgICAgIG91dC5sb29rdXAgPSBfLmV4dGVuZChvdXQubG9va3VwLCBsb29rdXApXG5cbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIHVybDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHVybCA9ICh0eXBlb2YodGhpcy51cmxSb290KSA9PT0gJ3N0cmluZycpID8gdGhpcy51cmxSb290IDogdGhpcy51cmxSb290KCk7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29rdXAudmlldykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzLnJ0cmltKHVybCwgJy8nKSArICcvJyArIHRoaXMubG9va3VwLnZpZXc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB1cmw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIsIGpRdWVyeSk7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuU2NoZW1hID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcblxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiXX0=
