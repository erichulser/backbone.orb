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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvbWFpbi5qcyIsInNyYy9tb2RlbHMuanMiLCJzcmMvcXVlcmllcy5qcyIsInNyYy9yZWNvcmRzZXQuanMiLCJzcmMvc2NoZW1hLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwid2luZG93Lm9yYiA9IHt9O1xuXG5yZXF1aXJlKCcuL3F1ZXJpZXMuanMnKTtcbnJlcXVpcmUoJy4vcmVjb3Jkc2V0LmpzJyk7XG5yZXF1aXJlKCcuL3NjaGVtYS5qcycpO1xucmVxdWlyZSgnLi9tb2RlbHMuanMnKTsiLCIoZnVuY3Rpb24gKG9yYiwgJCkge1xuICAgIG9yYi5Nb2RlbCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIHNjaGVtYTogdW5kZWZpbmVkLFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgLy8gc2V0dXAgZGVmYXVsdHMgYmFzZWQgb24gdGhlIHNjaGVtYVxuICAgICAgICAgICAgaWYgKHRoaXMuc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlZmF1bHRzID0ge307XG4gICAgICAgICAgICAgICAgXy5lYWNoKHRoaXMuc2NoZW1hLmNvbHVtbnMgfHwgW10sIGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi5kZWZhdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRzW2NvbHVtbi5maWVsZF0gPSBjb2x1bW4uZGVmYXVsdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBfLmV4dGVuZChkZWZhdWx0cywgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNhbGwgdGhlIGJhc2UgY2xhc3MncyBtZXRob2RcbiAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGFkZENvbGxlY3Rpb246IGZ1bmN0aW9uIChuYW1lLCBtb2RlbCwgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IG1vZGVsLnNlbGVjdCgpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMudXJsUm9vdCkge1xuICAgICAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IG9wdGlvbnMudXJsUm9vdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcy5ydHJpbShzZWxmLnVybFJvb3QsICcvJykgKyAnLycgKyBzZWxmLmdldCgnaWQnKSArICcvJyArIChvcHRpb25zLnVybFN1ZmZpeCB8fCBuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzW25hbWVdID0gcmVjb3JkcztcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzO1xuICAgICAgICB9LFxuICAgICAgICBhZGRSZWZlcmVuY2U6IGZ1bmN0aW9uIChuYW1lLCBtb2RlbCwgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgZ2V0dGVyID0gb3B0aW9ucy5nZXR0ZXIgfHwgJ2dldCcgKyBuYW1lWzBdLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICAgICAgICAgICAgdmFyIHNldHRlciA9IG9wdGlvbnMuc2V0dGVyIHx8ICdzZXQnICsgbmFtZVswXS50b1VwcGVyQ2FzZSgpICsgbmFtZS5zbGljZSgxKTtcbiAgICAgICAgICAgIHZhciBmaWVsZCA9IG9wdGlvbnMuZmllbGQgfHwgcy51bmRlcnNjb3JlZChuYW1lKSArICdfaWQnO1xuICAgICAgICAgICAgdmFyIHByb3BuYW1lID0gJ19fJyArIG5hbWU7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgZ2V0dGVyICYgc2V0dGVyIG1ldGhvZHNcbiAgICAgICAgICAgIHNlbGZbZ2V0dGVyXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXNlbGZbcHJvcG5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnJldmVyc2VMb29rdXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWYgPSBuZXcgbW9kZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZi51cmxSb290ID0gdGhpcy51cmwoKSArICcvJyArIG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmW3Byb3BuYW1lXSA9IHJlZjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemUgd2l0aCBsb2FkZWQgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHByb3BzID0gc2VsZi5nZXQobmFtZSkgfHwge2lkOiBzZWxmLmdldChmaWVsZCl9O1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZltwcm9wbmFtZV0gPSBuZXcgbW9kZWwocHJvcHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmW3Byb3BuYW1lXTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZWxmW3NldHRlcl0gPSBmdW5jdGlvbiAocmVjb3JkKSB7XG4gICAgICAgICAgICAgICAgc2VsZltwcm9wbmFtZV0gPSByZWNvcmQ7XG4gICAgICAgICAgICAgICAgc2VsZi5zZXQoZmllbGQsIHJlY29yZC5nZXQoJ2lkJykpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdmFyIGlkID0gdGhpcy5nZXQoJ2lkJyk7XG4gICAgICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb24udXJsKCkgKyAnLycgKyBpZDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLnVybCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS51cmwuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgY29sbGVjdGlvbjogb3JiLlJlY29yZFNldCxcbiAgICAgICAgYWxsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBzZWxlY3Q6IGZ1bmN0aW9uIChsb29rdXApIHtcbiAgICAgICAgICAgIHZhciByZWNvcmRzID0gbmV3IHRoaXMuY29sbGVjdGlvbigpO1xuICAgICAgICAgICAgcmVjb3Jkcy5sb29rdXAgPSBfLmV4dGVuZCh7fSwgcmVjb3Jkcy5sb29rdXAsIGxvb2t1cCk7XG4gICAgICAgICAgICByZWNvcmRzLnVybFJvb3QgPSB0aGlzLnByb3RvdHlwZS51cmxSb290O1xuICAgICAgICAgICAgcmVjb3Jkcy5tb2RlbCA9IHRoaXM7XG4gICAgICAgICAgICByZXR1cm4gcmVjb3JkcztcbiAgICAgICAgfSxcbiAgICAgICAgYnlJZDogZnVuY3Rpb24gKGlkLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBxID0gbmV3IG9yYi5RKCdpZCcpLmlzKGlkKTtcbiAgICAgICAgICAgIG9wdGlvbnMud2hlcmUgPSBxLmFuZChvcHRpb25zLndoZXJlKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdCgpLmZldGNoT25lKG9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiKTsiLCIoZnVuY3Rpb24gKG9yYikge1xuICAgIC8vIGRlZmluZSB0aGUgYmFzZSBxdWVyeSB0eXBlXG4gICAgb3JiLlEgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICc9PScsXG4gICAgICAgICAgICBjb2x1bW46IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHRhYmxlOiAnJyxcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgICAgICAgZnVuY3Rpb25zOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBtYXRoOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBpbnZlcnRlZDogZmFsc2UsXG4gICAgICAgICAgICB2YWx1ZTogdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mKG9wdGlvbnMpID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdjb2x1bW4nLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdldCgnZnVuY3Rpb25zJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdmdW5jdGlvbnMnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ21hdGgnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ21hdGgnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFmdGVyOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQWZ0ZXIpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBhYnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5BYnMpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5BbmQsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYXNTdHJpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkob3JiLlEuT3AuQXNTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmVmb3JlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmVmb3JlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYmV0d2VlbjogZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQmV0d2Vlbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIFthLCBiXSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjb250YWluczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Db250YWlucyk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGNvcHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhdHRycyA9IF8uZXh0ZW5kKHt9LCB0aGlzLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgYXR0cnNbJ2Z1bmN0aW9ucyddID0gYXR0cnNbJ2Z1bmN0aW9ucyddLnNsaWNlKDApO1xuICAgICAgICAgICAgYXR0cnNbJ21hdGgnXSA9IGF0dHJzWydtYXRoJ10uc2xpY2UoMCk7XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RKGF0dHJzKTtcblxuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90Q29udGFpbjogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90Q29udGFpbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RNYXRjaDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gdHJ1ZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLk1hdGNoZXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBlbmRzd2l0aDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkVuZHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZ3JlYXRlclRoYW46IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuT3JFcXVhbDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkdyZWF0ZXJUaGFuT3JFcXVhbCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpc05vdDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90KTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMuZ2V0KCdjb2x1bW4nKSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQpO1xuICAgICAgICB9LFxuICAgICAgICBpc1VuZGVmaW5lZDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0KCd2YWx1ZScpID09PSB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIG5vdEluOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuSXNOb3RJbik7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlLnNsaWNlKDApKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGxlc3NUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5MZXNzVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsb3dlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bmN0aW9uLkxvd2VyKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWF0Y2hlczogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICB2YXIgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gdHJ1ZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLk1hdGNoZXMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBtb2RpZnk6IGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICB0aGlzLmdldCgnZnVuY3Rpb25zJykucHVzaChmdW5jKTtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IG9yYi5RLk9wLk9yLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXJ0c3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5TdGFydHN3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncXVlcnknLFxuICAgICAgICAgICAgICAgIGNvbHVtbjogdGhpcy5nZXQoJ2NvbHVtbicpLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHZhbHVlOiB0aGlzLmdldCgndmFsdWUnKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIGZ1bmNzID0gdGhpcy5nZXQoJ2Z1bmN0aW9ucycpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkoZnVuY3MpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGpmdW5jcyA9IFtdO1xuICAgICAgICAgICAgICAgIF8uZWFjaChmdW5jcywgZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgICAgICAgICAgamZ1bmNzLnB1c2gob3JiLlEuRnVuY3Rpb24ua2V5KGZ1bmMpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLmZ1bmN0aW9ucyA9IGpmdW5jcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hdGggPSB0aGlzLmdldCgnbWF0aCcpO1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkobWF0aCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgam1hdGggPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2gobWF0aCwgZnVuY3Rpb24gKG9wKSB7XG4gICAgICAgICAgICAgICAgICAgIGptYXRoLnB1c2gob3JiLlEuTWF0aC5rZXkob3ApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBkYXRhLm1hdGggPSBqbWF0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgIH0sXG4gICAgICAgIHVwcGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVudGlvbnMuVXBwZXIpO1xuICAgICAgICB9XG4gICAgfSwge1xuICAgICAgICBPcDoge1xuICAgICAgICAgICAgSXM6ICc9PScsXG4gICAgICAgICAgICBJc05vdDogJyE9JyxcbiAgICAgICAgICAgIExlc3NUaGFuOiAnPCcsXG4gICAgICAgICAgICBMZXNzVGhhbk9yRXF1YWw6ICc8PScsXG4gICAgICAgICAgICBCZWZvcmU6ICc8JyxcbiAgICAgICAgICAgIEdyZWF0ZXJUaGFuOiAnPicsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbk9yRXF1YWw6ICc+PScsXG4gICAgICAgICAgICBBZnRlcjogJz4nLFxuICAgICAgICAgICAgQmV0d2VlbjogJ2JldHdlZW4nLFxuICAgICAgICAgICAgQ29udGFpbnM6ICdjb250YWlucycsXG4gICAgICAgICAgICBEb2VzTm90Q29udGFpbjogXCJkb2Vzbid0IG1hdGNoXCIsXG4gICAgICAgICAgICBTdGFydHN3aXRoOiAnc3RhcnRzd2l0aCcsXG4gICAgICAgICAgICBFbmRzd2l0aDogJ2VuZHN3aXRoJyxcbiAgICAgICAgICAgIE1hdGNoZXM6ICdtYXRjaGVzJyxcbiAgICAgICAgICAgIERvZXNOb3RNYXRjaDogXCJkb2Vzbid0IG1hdGNoXCIsXG4gICAgICAgICAgICBJc0luOiAnaXMgaW4nLFxuICAgICAgICAgICAgSXNOb3RJbjogJ2lzIG5vdCBpbicsXG4gICAgICAgICAgICBEb2VzTm90U3RhcnR3aXRoOiBcImRvZXNuJ3Qgc3RhcnR3aXRoXCIsXG4gICAgICAgICAgICBEb2VzTm90RW5kd2l0aDogXCJkb2Vzbid0IGVuZHdpdGhcIixcbiAgICAgICAgICAgIEFuZDogJ2FuZCcsXG4gICAgICAgICAgICBPcjogJ29yJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIE1hdGg6IHtcbiAgICAgICAgICAgIEFkZDogJysnLFxuICAgICAgICAgICAgU3VidHJhY3Q6ICctJyxcbiAgICAgICAgICAgIE11bHRpcGx5OiAnKicsXG4gICAgICAgICAgICBEaXZpZGU6ICcvJyxcbiAgICAgICAgICAgIEFuZDogJyYnLFxuICAgICAgICAgICAgT3I6ICd8JyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIEZ1bmN0aW9uOiB7XG4gICAgICAgICAgICBMb3dlcjogJ2xvd2VyJyxcbiAgICAgICAgICAgIFVwcGVyOiAndXBwZXInLFxuICAgICAgICAgICAgQWJzOiAnYWJzJyxcbiAgICAgICAgICAgIEFzU3RyaW5nOiAnc3RyJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5RQ29tcG91bmQgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICdBbmQnLFxuICAgICAgICAgICAgcXVlcmllczogdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ3F1ZXJpZXMnKSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoJ3F1ZXJpZXMnLCBbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFuZDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdldCgnb3AnKSA9PT0gb3JiLlEuT3AuQW5kKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5nZXQoJ3F1ZXJpZXMnKS5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICBuZXdfcXVlcmllcy5wdXNoKG90aGVyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IG5ld19xdWVyaWVzfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLkFuZCwgcXVlcmllczogW3RoaXMsIG90aGVyXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBvcDogdGhpcy5nZXQoJ29wJyksXG4gICAgICAgICAgICAgICAgcXVlcmllczogdGhpcy5nZXQoJ3F1ZXJpZXMnKS5zbGljZSgwKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZChvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYW1fbnVsbCA9IHRydWU7XG4gICAgICAgICAgICBfLmVhY2godGhpcy5nZXQoJ3F1ZXJpZXMnKSwgZnVuY3Rpb24gKHN1YnF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdWJxdWVyeS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgICAgICBhbV9udWxsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYW1fbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLk9yKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5nZXQoJ3F1ZXJpZXMnKS5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICBuZXdfcXVlcmllcy5wdXNoKG90aGVyKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5PciwgcXVlcmllczogbmV3X3F1ZXJpZXN9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuT3IsIHF1ZXJpZXM6IFt0aGlzLCBvdGhlcl19KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgcXVlcnlfanNvbiA9IFtdO1xuICAgICAgICAgICAgXy5lYWNoKHRoaXMuZ2V0KCdxdWVyaWVzJyksIGZ1bmN0aW9uIChxdWVyeSkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5X2pzb24ucHVzaChxdWVyeS50b0pTT04oKSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY29tcG91bmQnLFxuICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5rZXkodGhpcy5nZXQoJ29wJykpLFxuICAgICAgICAgICAgICAgIHF1ZXJpZXM6IHF1ZXJ5X2pzb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLlJlY29yZFNldCA9IEJhY2tib25lLkNvbGxlY3Rpb24uZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5sb29rdXAgPSB7fTtcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlOiBmdW5jdGlvbiAocHJvcGVydGllcywgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucy51cmwgPSB0aGlzLnVybCgpO1xuICAgICAgICAgICAgQmFja2JvbmUuQ29sbGVjdGlvbi5wcm90b3R5cGUuY3JlYXRlLmNhbGwocHJvcGVydGllcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGNvcHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSBuZXcgdGhpcy5jb25zdHJ1Y3RvcigpO1xuICAgICAgICAgICAgb3V0LnVybFJvb3QgPSB0aGlzLnVybFJvb3Q7XG4gICAgICAgICAgICBvdXQubW9kZWwgPSB0aGlzLm1vZGVsO1xuICAgICAgICAgICAgb3V0Lmxvb2t1cCA9IF8uZXh0ZW5kKHt9LCBvdXQubG9va3VwKTtcblxuICAgICAgICAgICAgLy8gY3JlYXRlIGEgY29weSBvZiB0aGUgd2hlcmUgcXVlcnlcbiAgICAgICAgICAgIGlmIChvdXQubG9va3VwLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC53aGVyZSA9IG91dC5sb29rdXAud2hlcmUuY29weSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob3V0Lmxvb2t1cC5jb2x1bW5zKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC5jb2x1bW5zID0gb3V0Lmxvb2t1cC5jb2x1bW5zLnNsaWNlKDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob3V0Lmxvb2t1cC5vcmRlciAmJiB0eXBlb2Yob3V0Lmxvb2t1cC5vcmRlcikgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgb3V0Lmxvb2t1cC5vcmRlciA9IG91dC5sb29rdXAub3JkZXIuc2xpY2UoMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaENvdW50OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmV0Y2goXy5leHRlbmQoe30sIG9wdGlvbnMsIHtkYXRhOiB7cmV0dXJuaW5nOiAnY291bnQnfX0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgZmV0Y2g6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgbG9va3VwID0ge307XG5cbiAgICAgICAgICAgIC8vIHNldHVwIHRoZSB3aGVyZSBxdWVyeVxuICAgICAgICAgICAgdmFyIHdoZXJlID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKHRoaXMubG9va3VwLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgd2hlcmUgPSB0aGlzLmxvb2t1cC53aGVyZS5hbmQob3B0aW9ucy53aGVyZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG9wdGlvbnMud2hlcmUpIHtcbiAgICAgICAgICAgICAgICB3aGVyZSA9IG9wdGlvbnMud2hlcmU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2hlcmUgJiYgIXdoZXJlLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgbG9va3VwLndoZXJlID0gd2hlcmUudG9KU09OKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldHVwIHRoZSByZXN0IG9mIHRoZSBsb29rdXAgb3B0aW9uc1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMubGltaXQgfHwgdGhpcy5sb29rdXAubGltaXQpIHtcbiAgICAgICAgICAgICAgICBsb29rdXAubGltaXQgPSBvcHRpb25zLmxpbWl0IHx8IHRoaXMubG9va3VwLmxpbWl0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG9wdGlvbnMub3JkZXIgfHwgdGhpcy5sb29rdXAub3JkZXIpIHtcbiAgICAgICAgICAgICAgICBsb29rdXAub3JkZXIgPSBvcHRpb25zLm9yZGVyIHx8IHRoaXMubG9va3VwLm9yZGVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG9wdGlvbnMuZXhwYW5kIHx8IHRoaXMubG9va3VwLmV4cGFuZCkge1xuICAgICAgICAgICAgICAgIGxvb2t1cC5leHBhbmQgPSBvcHRpb25zLmV4cGFuZCB8fCB0aGlzLmxvb2t1cC5leHBhbmQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgbG9va3VwIHNwZWNpZmljIG9wdGlvbnMsIHVwZGF0ZSB0aGUgcm9vdCBxdWVyeVxuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkobG9va3VwKSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YSA9IF8uZXh0ZW5kKHtsb29rdXA6IEpTT04uc3RyaW5naWZ5KGxvb2t1cCl9LCBvcHRpb25zLmRhdGEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjYWxsIHRoZSBiYXNlIGNvbGxlY3Rpb24gbG9va3VwIGNvbW1hbmRzXG4gICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuQ29sbGVjdGlvbi5wcm90b3R5cGUuZmV0Y2guY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgZmV0Y2hPbmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHZhciBvcHRzID0gXy5leHRlbmQoe30sIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICBsaW1pdDogMSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdGlvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3MoY29sbGVjdGlvbi5hdCgwKSwgZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2Vzcyh1bmRlZmluZWQsIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mZXRjaChvcHRzKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVmaW5lOiBmdW5jdGlvbiAobG9va3VwKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG5cbiAgICAgICAgICAgIC8vIG1lcmdlIHRoZSB3aGVyZSBsb29rdXBzXG4gICAgICAgICAgICBpZiAob3V0Lmxvb2t1cC53aGVyZSkge1xuICAgICAgICAgICAgICAgIG91dC5sb29rdXAud2hlcmUgPSBvdXQubG9va3VwLndoZXJlLmFuZChsb29rdXAud2hlcmUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChsb29rdXAud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQubG9va3VwLndoZXJlID0gbG9va3VwLndoZXJlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyByZW1vdmUgdGhlIHdoZXJlIG9wdGlvblxuICAgICAgICAgICAgZGVsZXRlIGxvb2t1cC53aGVyZTtcblxuICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgb3RoZXIgb3B0aW9uc1xuICAgICAgICAgICAgb3V0Lmxvb2t1cCA9IF8uZXh0ZW5kKG91dC5sb29rdXAsIGxvb2t1cClcblxuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdXJsID0gKHR5cGVvZih0aGlzLnVybFJvb3QpID09PSAnc3RyaW5nJykgPyB0aGlzLnVybFJvb3QgOiB0aGlzLnVybFJvb3QoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmxvb2t1cC52aWV3KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMucnRyaW0odXJsLCAnLycpICsgJy8nICsgdGhpcy5sb29rdXAudmlldztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHVybDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiLCIoZnVuY3Rpb24gKG9yYiwgJCkge1xuICAgIG9yYi5TY2hlbWEgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuXG4gICAgfSk7XG59KSh3aW5kb3cub3JiLCBqUXVlcnkpOyJdfQ==
