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