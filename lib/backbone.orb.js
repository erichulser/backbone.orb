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
                    // initialize with loaded properties
                    var props = self.get(name) || {id: self.get(field)};
                    self[propname] = new model(props);
                }
                return self[propname];
            };
            self[setter] = function (record) {
                self[propname] = record;
                self.set(field, record.get('id'));
            };
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvbWFpbi5qcyIsInNyYy9tb2RlbHMuanMiLCJzcmMvcXVlcmllcy5qcyIsInNyYy9yZWNvcmRzZXQuanMiLCJzcmMvc2NoZW1hLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIndpbmRvdy5vcmIgPSB7fTtcblxucmVxdWlyZSgnLi9xdWVyaWVzLmpzJyk7XG5yZXF1aXJlKCcuL3JlY29yZHNldC5qcycpO1xucmVxdWlyZSgnLi9zY2hlbWEuanMnKTtcbnJlcXVpcmUoJy4vbW9kZWxzLmpzJyk7IiwiKGZ1bmN0aW9uIChvcmIsICQpIHtcbiAgICBvcmIuTW9kZWwgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBzY2hlbWE6IHVuZGVmaW5lZCxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIC8vIHNldHVwIGRlZmF1bHRzIGJhc2VkIG9uIHRoZSBzY2hlbWFcbiAgICAgICAgICAgIGlmICh0aGlzLnNjaGVtYSkge1xuICAgICAgICAgICAgICAgIHZhciBkZWZhdWx0cyA9IHt9O1xuICAgICAgICAgICAgICAgIF8uZWFjaCh0aGlzLnNjaGVtYS5jb2x1bW5zIHx8IFtdLCBmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2x1bW4uZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0c1tjb2x1bW4uZmllbGRdID0gY29sdW1uLmRlZmF1bHQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gXy5leHRlbmQoZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjYWxsIHRoZSBiYXNlIGNsYXNzJ3MgbWV0aG9kXG4gICAgICAgICAgICBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBhZGRDb2xsZWN0aW9uOiBmdW5jdGlvbiAobmFtZSwgbW9kZWwsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIHJlY29yZHMgPSBtb2RlbC5zZWxlY3QoKTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnVybFJvb3QpIHtcbiAgICAgICAgICAgICAgICByZWNvcmRzLnVybFJvb3QgPSBvcHRpb25zLnVybFJvb3Q7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHMucnRyaW0oc2VsZi51cmxSb290LCAnLycpICsgJy8nICsgc2VsZi5nZXQoJ2lkJykgKyAnLycgKyAob3B0aW9ucy51cmxTdWZmaXggfHwgbmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpc1tuYW1lXSA9IHJlY29yZHM7XG4gICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgfSxcbiAgICAgICAgYWRkUmVmZXJlbmNlOiBmdW5jdGlvbiAobmFtZSwgbW9kZWwsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIGdldHRlciA9IG9wdGlvbnMuZ2V0dGVyIHx8ICdnZXQnICsgbmFtZVswXS50b1VwcGVyQ2FzZSgpICsgbmFtZS5zbGljZSgxKTtcbiAgICAgICAgICAgIHZhciBzZXR0ZXIgPSBvcHRpb25zLnNldHRlciB8fCAnc2V0JyArIG5hbWVbMF0udG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgICB2YXIgZmllbGQgPSBvcHRpb25zLmZpZWxkIHx8IHMudW5kZXJzY29yZWQobmFtZSkgKyAnX2lkJztcbiAgICAgICAgICAgIHZhciBwcm9wbmFtZSA9ICdfXycgKyBuYW1lO1xuXG4gICAgICAgICAgICAvLyBjcmVhdGUgdGhlIGdldHRlciAmIHNldHRlciBtZXRob2RzXG4gICAgICAgICAgICBzZWxmW2dldHRlcl0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzZWxmW3Byb3BuYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplIHdpdGggbG9hZGVkIHByb3BlcnRpZXNcbiAgICAgICAgICAgICAgICAgICAgdmFyIHByb3BzID0gc2VsZi5nZXQobmFtZSkgfHwge2lkOiBzZWxmLmdldChmaWVsZCl9O1xuICAgICAgICAgICAgICAgICAgICBzZWxmW3Byb3BuYW1lXSA9IG5ldyBtb2RlbChwcm9wcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmW3Byb3BuYW1lXTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZWxmW3NldHRlcl0gPSBmdW5jdGlvbiAocmVjb3JkKSB7XG4gICAgICAgICAgICAgICAgc2VsZltwcm9wbmFtZV0gPSByZWNvcmQ7XG4gICAgICAgICAgICAgICAgc2VsZi5zZXQoZmllbGQsIHJlY29yZC5nZXQoJ2lkJykpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgY29sbGVjdGlvbjogb3JiLlJlY29yZFNldCxcbiAgICAgICAgYWxsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBzZWxlY3Q6IGZ1bmN0aW9uIChsb29rdXApIHtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gbmV3IHRoaXMuY29sbGVjdGlvbigpO1xuICAgICAgICAgICAgcmVjb3Jkcy5sb29rdXAgPSBfLmV4dGVuZCh7fSwgcmVjb3Jkcy5sb29rdXAsIGxvb2t1cCk7XG4gICAgICAgICAgICByZWNvcmRzLnVybFJvb3QgPSB0aGlzLnByb3RvdHlwZS51cmxSb290O1xuICAgICAgICAgICAgcmVjb3Jkcy5tb2RlbCA9IHRoaXM7XG4gICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgfSxcbiAgICAgICAgYnlJZDogZnVuY3Rpb24gKGlkLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBxID0gbmV3IG9yYi5RKCdpZCcpLmlzKGlkKTtcbiAgICAgICAgICAgIG9wdGlvbnMud2hlcmUgPSBxLmFuZChvcHRpb25zLndoZXJlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdCgpLmZldGNoT25lKG9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiKTsiLCIoZnVuY3Rpb24gKG9yYikge1xuICAgIC8vIGRlZmluZSB0aGUgYmFzZSBxdWVyeSB0eXBlXG4gICAgb3JiLlEgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICc9PScsXG4gICAgICAgICAgICBjb2x1bW46IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHRhYmxlOiAnJyxcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgICAgICAgZnVuY3Rpb25zOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBtYXRoOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBpbnZlcnRlZDogZmFsc2UsXG4gICAgICAgICAgICB2YWx1ZTogdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mKG9wdGlvbnMpID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdjb2x1bW4nLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdldCgnZnVuY3Rpb25zJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdmdW5jdGlvbnMnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ21hdGgnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ21hdGgnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFmdGVyOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQWZ0ZXIpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBhYnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5BYnMpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5BbmQsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYXNTdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkob3JiLlEuT3AuQXNTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmVmb3JlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmVmb3JlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmV0d2VlbjogZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmV0d2Vlbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIFthLCBiXSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjb250YWluczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Db250YWlucyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGNvcHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhdHRycyA9IF8uZXh0ZW5kKHt9LCB0aGlzLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgYXR0cnNbJ2Z1bmN0aW9ucyddID0gYXR0cnNbJ2Z1bmN0aW9ucyddLnNsaWNlKDApO1xuICAgICAgICAgICAgYXR0cnNbJ21hdGgnXSA9IGF0dHJzWydtYXRoJ10uc2xpY2UoMCk7XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RKGF0dHJzKTtcblxuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90Q29udGFpbjogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90Q29udGFpbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RNYXRjaDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gdHJ1ZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLk1hdGNoZXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBlbmRzd2l0aDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkVuZHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZ3JlYXRlclRoYW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuT3JFcXVhbDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkdyZWF0ZXJUaGFuT3JFcXVhbCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpc05vdDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90KTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMuZ2V0KCdjb2x1bW4nKSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQpO1xuICAgICAgICB9LFxuICAgICAgICBpc1VuZGVmaW5lZDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIG5vdEluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNOb3RJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxlc3NUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5MZXNzVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsb3dlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bmN0aW9uLkxvd2VyKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWF0Y2hlczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gdHJ1ZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLk1hdGNoZXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBtb2RpZnk6IGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICB0aGlzLmdldCgnZnVuY3Rpb25zJykucHVzaChmdW5jKTtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLk9yLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXJ0c3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5TdGFydHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncXVlcnknLFxuICAgICAgICAgICAgICAgIGNvbHVtbjogdGhpcy5nZXQoJ2NvbHVtbicpLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHZhbHVlOiB0aGlzLmdldCgndmFsdWUnKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIGZ1bmNzID0gdGhpcy5nZXQoJ2Z1bmN0aW9ucycpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkoZnVuY3MpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGpmdW5jcyA9IFtdO1xuICAgICAgICAgICAgICAgIF8uZWFjaChmdW5jcywgZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgICAgICAgICAgamZ1bmNzLnB1c2gob3JiLlEuRnVuY3Rpb24ua2V5KGZ1bmMpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLmZ1bmN0aW9ucyA9IGpmdW5jcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hdGggPSB0aGlzLmdldCgnbWF0aCcpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkobWF0aCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgam1hdGggPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2gobWF0aCwgZnVuY3Rpb24gKG9wKSB7XG4gICAgICAgICAgICAgICAgICAgIGptYXRoLnB1c2gob3JiLlEuTWF0aC5rZXkob3ApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLm1hdGggPSBqbWF0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgIH0sXG4gICAgICAgIHVwcGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVudGlvbnMuVXBwZXIpO1xuICAgICAgICB9XG4gICAgfSwge1xuICAgICAgICBPcDoge1xuICAgICAgICAgICAgSXM6ICc9PScsXG4gICAgICAgICAgICBJc05vdDogJyE9JyxcbiAgICAgICAgICAgIExlc3NUaGFuOiAnPCcsXG4gICAgICAgICAgICBMZXNzVGhhbk9yRXF1YWw6ICc8PScsXG4gICAgICAgICAgICBCZWZvcmU6ICc8JyxcbiAgICAgICAgICAgIEdyZWF0ZXJUaGFuOiAnPicsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbk9yRXF1YWw6ICc+PScsXG4gICAgICAgICAgICBBZnRlcjogJz4nLFxuICAgICAgICAgICAgQmV0d2VlbjogJ2JldHdlZW4nLFxuICAgICAgICAgICAgQ29udGFpbnM6ICdjb250YWlucycsXG4gICAgICAgICAgICBEb2VzTm90Q29udGFpbjogXCJkb2Vzbid0IG1hdGNoXCIsXG4gICAgICAgICAgICBTdGFydHN3aXRoOiAnc3RhcnRzd2l0aCcsXG4gICAgICAgICAgICBFbmRzd2l0aDogJ2VuZHN3aXRoJyxcbiAgICAgICAgICAgIE1hdGNoZXM6ICdtYXRjaGVzJyxcbiAgICAgICAgICAgIERvZXNOb3RNYXRjaDogXCJkb2Vzbid0IG1hdGNoXCIsXG4gICAgICAgICAgICBJc0luOiAnaXMgaW4nLFxuICAgICAgICAgICAgSXNOb3RJbjogJ2lzIG5vdCBpbicsXG4gICAgICAgICAgICBEb2VzTm90U3RhcnR3aXRoOiBcImRvZXNuJ3Qgc3RhcnR3aXRoXCIsXG4gICAgICAgICAgICBEb2VzTm90RW5kd2l0aDogXCJkb2Vzbid0IGVuZHdpdGhcIixcbiAgICAgICAgICAgIEFuZDogJ2FuZCcsXG4gICAgICAgICAgICBPcjogJ29yJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIE1hdGg6IHtcbiAgICAgICAgICAgIEFkZDogJysnLFxuICAgICAgICAgICAgU3VidHJhY3Q6ICctJyxcbiAgICAgICAgICAgIE11bHRpcGx5OiAnKicsXG4gICAgICAgICAgICBEaXZpZGU6ICcvJyxcbiAgICAgICAgICAgIEFuZDogJyYnLFxuICAgICAgICAgICAgT3I6ICd8JyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIEZ1bmN0aW9uOiB7XG4gICAgICAgICAgICBMb3dlcjogJ2xvd2VyJyxcbiAgICAgICAgICAgIFVwcGVyOiAndXBwZXInLFxuICAgICAgICAgICAgQWJzOiAnYWJzJyxcbiAgICAgICAgICAgIEFzU3RyaW5nOiAnc3RyJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5RQ29tcG91bmQgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICdBbmQnLFxuICAgICAgICAgICAgcXVlcmllczogdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ3F1ZXJpZXMnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ3F1ZXJpZXMnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFuZDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdldCgnb3AnKSA9PT0gb3JiLlEuT3AuQW5kKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5nZXQoJ3F1ZXJpZXMnKS5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICBuZXdfcXVlcmllcy5wdXNoKG90aGVyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLkFuZCwgcXVlcmllczogW3RoaXMsIG90aGVyXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBvcDogdGhpcy5nZXQoJ29wJyksXG4gICAgICAgICAgICAgICAgcXVlcmllczogdGhpcy5nZXQoJ3F1ZXJpZXMnKS5zbGljZSgwKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZChvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYW1fbnVsbCA9IHRydWU7XG4gICAgICAgICAgICBfLmVhY2godGhpcy5nZXQoJ3F1ZXJpZXMnKSwgZnVuY3Rpb24gKHN1YnF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdWJxdWVyeS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgICAgICBhbV9udWxsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYW1fbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLk9yKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5nZXQoJ3F1ZXJpZXMnKS5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICBuZXdfcXVlcmllcy5wdXNoKG90aGVyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5PciwgcXVlcmllczogbmV3X3F1ZXJpZXN9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuT3IsIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl19KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgcXVlcnlfanNvbiA9IFtdO1xuICAgICAgICAgICAgXy5lYWNoKHRoaXMuZ2V0KCdxdWVyaWVzJyksIGZ1bmN0aW9uIChxdWVyeSkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5X2pzb24ucHVzaChxdWVyeS50b0pTT04oKSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY29tcG91bmQnLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHF1ZXJ5X2pzb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLlJlY29yZFNldCA9IEJhY2tib25lLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5sb29rdXAgPSB7fTtcbiAgICAgICAgfSxcbiAgICAgICAgY29weTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKCk7XG4gICAgICAgICAgICBvdXQudXJsUm9vdCA9IHRoaXMudXJsUm9vdDtcbiAgICAgICAgICAgIG91dC5tb2RlbCA9IHRoaXMubW9kZWw7XG4gICAgICAgICAgICBvdXQubG9va3VwID0gXy5leHRlbmQoe30sIG91dC5sb29rdXApO1xuXG4gICAgICAgICAgICAvLyBjcmVhdGUgYSBjb3B5IG9mIHRoZSB3aGVyZSBxdWVyeVxuICAgICAgICAgICAgaWYgKG91dC5sb29rdXAud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQubG9va3VwLndoZXJlID0gb3V0Lmxvb2t1cC53aGVyZS5jb3B5KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvdXQubG9va3VwLmNvbHVtbnMpIHtcbiAgICAgICAgICAgICAgICBvdXQubG9va3VwLmNvbHVtbnMgPSBvdXQubG9va3VwLmNvbHVtbnMuc2xpY2UoMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvdXQubG9va3VwLm9yZGVyICYmIHR5cGVvZihvdXQubG9va3VwLm9yZGVyKSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBvdXQubG9va3VwLm9yZGVyID0gb3V0Lmxvb2t1cC5vcmRlci5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoQ291bnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mZXRjaChfLmV4dGVuZCh7fSwgb3B0aW9ucywge2RhdGE6IHtyZXR1cm5pbmc6ICdjb3VudCd9fSkpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBsb29rdXAgPSB7fTtcblxuICAgICAgICAgICAgLy8gc2V0dXAgdGhlIHdoZXJlIHF1ZXJ5XG4gICAgICAgICAgICB2YXIgd2hlcmUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAodGhpcy5sb29rdXAud2hlcmUpIHtcbiAgICAgICAgICAgICAgICB3aGVyZSA9IHRoaXMubG9va3VwLndoZXJlLmFuZChvcHRpb25zLndoZXJlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAob3B0aW9ucy53aGVyZSkge1xuICAgICAgICAgICAgICAgIHdoZXJlID0gb3B0aW9ucy53aGVyZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh3aGVyZSAmJiAhd2hlcmUuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICBsb29rdXAud2hlcmUgPSB3aGVyZS50b0pTT04oKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0dXAgdGhlIHJlc3Qgb2YgdGhlIGxvb2t1cCBvcHRpb25zXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5saW1pdCB8fCB0aGlzLmxvb2t1cC5saW1pdCkge1xuICAgICAgICAgICAgICAgIGxvb2t1cC5saW1pdCA9IG9wdGlvbnMubGltaXQgfHwgdGhpcy5sb29rdXAubGltaXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5vcmRlciB8fCB0aGlzLmxvb2t1cC5vcmRlcikge1xuICAgICAgICAgICAgICAgIGxvb2t1cC5vcmRlciA9IG9wdGlvbnMub3JkZXIgfHwgdGhpcy5sb29rdXAub3JkZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5leHBhbmQgfHwgdGhpcy5sb29rdXAuZXhwYW5kKSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLmV4cGFuZCA9IG9wdGlvbnMuZXhwYW5kIHx8IHRoaXMubG9va3VwLmV4cGFuZDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBsb29rdXAgc3BlY2lmaWMgb3B0aW9ucywgdXBkYXRlIHRoZSByb290IHF1ZXJ5XG4gICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShsb29rdXApKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5kYXRhID0gXy5leHRlbmQoe2xvb2t1cDogSlNPTi5zdHJpbmdpZnkobG9va3VwKX0sIG9wdGlvbnMuZGF0YSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNhbGwgdGhlIGJhc2UgY29sbGVjdGlvbiBsb29rdXAgY29tbWFuZHNcbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Db2xsZWN0aW9uLnByb3RvdHlwZS5mZXRjaC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaE9uZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIG9wdHMgPSBfLmV4dGVuZCh7fSwgb3B0aW9ucywge1xuICAgICAgICAgICAgICAgIGxpbWl0OiAxLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0aW9uLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2Vzcyhjb2xsZWN0aW9uLmF0KDApLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5zdWNjZXNzKHVuZGVmaW5lZCwgZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZldGNoKG9wdHMpO1xuICAgICAgICB9LFxuICAgICAgICByZWZpbmU6IGZ1bmN0aW9uIChsb29rdXApIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcblxuICAgICAgICAgICAgLy8gbWVyZ2UgdGhlIHdoZXJlIGxvb2t1cHNcbiAgICAgICAgICAgIGlmIChvdXQubG9va3VwLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC53aGVyZSA9IG91dC5sb29rdXAud2hlcmUuYW5kKGxvb2t1cC53aGVyZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGxvb2t1cC53aGVyZSkge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAud2hlcmUgPSBsb29rdXAud2hlcmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSB0aGUgd2hlcmUgb3B0aW9uXG4gICAgICAgICAgICBkZWxldGUgbG9va3VwLndoZXJlO1xuXG4gICAgICAgICAgICAvLyByZXBsYWNlIHRoZSBvdGhlciBvcHRpb25zXG4gICAgICAgICAgICBvdXQubG9va3VwID0gXy5leHRlbmQob3V0Lmxvb2t1cCwgbG9va3VwKVxuXG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICB1cmw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB1cmwgPSAodHlwZW9mKHRoaXMudXJsUm9vdCkgPT09ICdzdHJpbmcnKSA/IHRoaXMudXJsUm9vdCA6IHRoaXMudXJsUm9vdCgpO1xuICAgICAgICAgICAgaWYgKHRoaXMubG9va3VwLnZpZXcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5ydHJpbSh1cmwsICcvJykgKyAnLycgKyB0aGlzLmxvb2t1cC52aWV3O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdXJsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiLCBqUXVlcnkpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLlNjaGVtYSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG5cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIsIGpRdWVyeSk7Il19
