(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.orb = {
    ready: function (api_root, options) {
        options = options || {};
        var scope = options.scope || {};
        $.getJSON({
            url: api_root + '?returning=schema',
            type: 'GET',
            dataType: 'json',
            crossDomain: true,
            processData: false,
            contentType: 'application/json',
            success: function (schemas) {
                _.forEach(schemas, function (schema) {
                    var defaults = {};

                    schema.referenceScope = scope;

                    // create the default values
                    _.forEach(schema.columns, function (column, field) {
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
            },
            error: options.error
        });
    }
};

require('./schema');
require('./collection');
require('./model');
require('./queries');
require('./ui/all');
},{"./collection":2,"./model":3,"./queries":4,"./schema":5,"./ui/all":6}],2:[function(require,module,exports){
(function (orb, $) {
    orb.Collection = Backbone.Collection.extend({
        initialize: function () {
            this.context = {};
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
            var context = {};

            // setup the where query
            var where = undefined;
            if (this.context.where) {
                where = this.context.where.and(options.where);
            } else if (options.where) {
                where = options.where;
            }
            if (where && !where.isNull()) {
                context.where = where.toJSON();
            }

            // setup the rest of the context options
            if (options.limit || this.context.limit) {
                context.limit = options.limit || this.context.limit;
            }
            if (options.order || this.context.order) {
                context.order = options.order || this.context.order;
            }
            if (options.expand || this.context.expand) {
                context.expand = options.expand || this.context.expand;
            }

            // if we have context specific options, update the root query
            if (!_.isEmpty(context)) {
                options.data = _.extend({context: JSON.stringify(context)}, options.data);
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

            // merge the where contexts
            if (out.context.where) {
                out.context.where = out.context.where.and(context.where);
            } else if (context.where) {
                out.context.where = context.where;
            }

            // remove the where option
            delete context.where;

            // replace the other options
            out.context = _.extend(out.context, context)

            return out;
        },
        url: function () {
            var url = (typeof(this.urlRoot) === 'string') ? this.urlRoot : this.urlRoot();
            if (this.context.view) {
                return s.rtrim(url, '/') + '/' + this.context.view;
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
            var self = this;
            options = options || {};

            // initialize information from the schema
            self.references = {};

            // create the reference information
            var schema = self.constructor.schema;
            if (schema) {
                _.forEach(schema.columns, function (column) {
                    if (column.type === 'Reference') {
                        self.references[column.name] = undefined;
                    }
                });

                _.forEach(schema.collectors, function (collector) {
                    if (collector.flags.Unique) {
                        self.references[collector.name] = undefined;
                    } else {
                        var model = schema.referenceScope[collector.model];
                        var records = new  model.collection();
                        records.urlRoot = function () {
                            var root = self.urlRoot;
                            var record_id = self.get('id');
                            if (!(root && record_id)) {
                                return undefined;
                            } else {
                                var trimmed = s.trim(self.urlRoot, '/');
                                return trimmed + '/' + record_id;
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
                _.forEach(schema.columns, function (col) {
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

            if (schema) {
                // load references
                _.forEach(schema.columns, function (column) {
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
                _.forEach(schema.collectors, function (collector) {
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
            _.forEach(attributes, function (value, attribute) {
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
            var records = new this.collection();
            records.context = _.extend({}, records.context, context);
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
},{}],6:[function(require,module,exports){
window.orb.ui = window.orb.ui || {};

require('./query_builder.js');
},{"./query_builder.js":7}],7:[function(require,module,exports){
if (window.Marionette) {
    (function (orb, Marionette, $) {
        orb.ui.QueryItem = Marionette.ItemView.extend({
            tagName: 'li',
            model: orb.Query,
            template: _.template(
                '<div class="form-group">' +
                    '<div class="input-group">' +
                        '<div class="input-group-btn">' +
                            '<button class="btn btn-default remove-btn"><strong>&times;</strong></button>' +
                        '</div>' +
                        '<input class="form-control" value="<%- column %>"/>' +
                    '</div>' +
                    '<select class="form-control" value="<%- op %>">' +
                        '<option>Is</option>' +
                        '<option>Is not</option>' +
                    '</select>' +
                    '<span id="editor">' +
                        '<input class="form-control" value="<%- value %>"/>' +
                    '</span>' +
                    '<div class="btn-group">' +
                        '<div class="btn btn-default op-btn" data-op="And">And</div>' +
                        '<div class="btn btn-default op-btn" data-op="Or">Or</div>' +
                    '</div>' +
                '</div>'
            ),
            events: {
                'click .remove-btn': 'triggerRemove',
                'click .op-btn': 'triggerOpSwitch',
                'click .op-btn': 'triggerOpSwitch'
            },
            triggerRemove: function () {
                this.trigger('action:removed');
            },
            triggerOpSwitch: function (event) {
                var op = $(event.target).data('op');
                this.trigger('action:op-switched', op);
            }
        });

        orb.ui.QueryCompoundItem = Marionette.ItemView.extend({
            tagName: 'li',
            model: orb.QueryCompound,
            template: _.template(
                '<div class="form-group">' +
                    '<button class="btn btn-xs"><i class="fa fa-remove"></i></button>' +
                    '<span><em>Compound</em></span>' +
                    '<button class="btn btn-xs"><i class="fa fa-arrow-right"></i></button>' +
                '</div>'
            )
        });

        orb.ui.QueryBuilder = Marionette.CompositeView.extend({
            tagName: 'div',
            attributes: {
                class: 'query-builder form form-inline',
                role: 'form'
            },
            childView: function (item) {
                if (item.model instanceof orb.Q) {
                    return new orb.ui.QueryItem(item);
                } else {
                    return new orb.ui.QueryCompoundItem(item);
                }
            },
            childViewContainer: '#query-items',
            childEvents: {
                'action:op-switched': 'switchOp',
                'action:removed': 'removeQuery'
            },
            template: _.template(
                '<ul id="query-items" class="list-unstyled"></ul>'
            ),
            initialize: function (options) {
                options = options || {};
                this.schema = options.schema;
            },
            removeQuery: function (query) {
                if (this.collection.length > 1) {
                    this.collection.remove(query.model);
                }
            },
            switchOp: function (op) {
                this.collection.add(new orb.Q());
            }
        })
    })(window.orb, window.Marionette, $);
}
},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWxsLmpzIiwic3JjL2NvbGxlY3Rpb24uanMiLCJzcmMvbW9kZWwuanMiLCJzcmMvcXVlcmllcy5qcyIsInNyYy9zY2hlbWEuanMiLCJzcmMvdWkvYWxsLmpzIiwic3JjL3VpL3F1ZXJ5X2J1aWxkZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pJQTtBQUNBO0FBQ0E7O0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwid2luZG93Lm9yYiA9IHtcbiAgICByZWFkeTogZnVuY3Rpb24gKGFwaV9yb290LCBvcHRpb25zKSB7XG4gICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICB2YXIgc2NvcGUgPSBvcHRpb25zLnNjb3BlIHx8IHt9O1xuICAgICAgICAkLmdldEpTT04oe1xuICAgICAgICAgICAgdXJsOiBhcGlfcm9vdCArICc/cmV0dXJuaW5nPXNjaGVtYScsXG4gICAgICAgICAgICB0eXBlOiAnR0VUJyxcbiAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICBjcm9zc0RvbWFpbjogdHJ1ZSxcbiAgICAgICAgICAgIHByb2Nlc3NEYXRhOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoc2NoZW1hcykge1xuICAgICAgICAgICAgICAgIF8uZm9yRWFjaChzY2hlbWFzLCBmdW5jdGlvbiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBkZWZhdWx0cyA9IHt9O1xuXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYS5yZWZlcmVuY2VTY29wZSA9IHNjb3BlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgZGVmYXVsdCB2YWx1ZXNcbiAgICAgICAgICAgICAgICAgICAgXy5mb3JFYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uLCBmaWVsZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbHVtbi50eXBlICE9PSAnSWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdHNbZmllbGRdID0gY29sdW1uWydkZWZhdWx0J107XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgbW9kZWxcbiAgICAgICAgICAgICAgICAgICAgc2NvcGVbc2NoZW1hLm1vZGVsXSA9IG9yYi5Nb2RlbC5leHRlbmQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsUm9vdDogc2NoZW1hLnVybFJvb3QsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0czogZGVmYXVsdHNcbiAgICAgICAgICAgICAgICAgICAgfSwge3NjaGVtYTogc2NoZW1hfSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBub3RpZnkgdGhlIHN5c3RlbSBvbiBzdWNjZXNzXG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuc3VjY2VzcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3VjY2VzcyhzY29wZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVycm9yOiBvcHRpb25zLmVycm9yXG4gICAgICAgIH0pO1xuICAgIH1cbn07XG5cbnJlcXVpcmUoJy4vc2NoZW1hJyk7XG5yZXF1aXJlKCcuL2NvbGxlY3Rpb24nKTtcbnJlcXVpcmUoJy4vbW9kZWwnKTtcbnJlcXVpcmUoJy4vcXVlcmllcycpO1xucmVxdWlyZSgnLi91aS9hbGwnKTsiLCIoZnVuY3Rpb24gKG9yYiwgJCkge1xuICAgIG9yYi5Db2xsZWN0aW9uID0gQmFja2JvbmUuQ29sbGVjdGlvbi5leHRlbmQoe1xuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQgPSB7fTtcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlOiBmdW5jdGlvbiAocHJvcGVydGllcywgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICBvcHRpb25zLnVybCA9IHRoaXMudXJsKCk7XG4gICAgICAgICAgICBCYWNrYm9uZS5Db2xsZWN0aW9uLnByb3RvdHlwZS5jcmVhdGUuY2FsbCh0aGlzLCBwcm9wZXJ0aWVzLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgY29weTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKCk7XG4gICAgICAgICAgICBvdXQudXJsUm9vdCA9IHRoaXMudXJsUm9vdDtcbiAgICAgICAgICAgIG91dC5tb2RlbCA9IHRoaXMubW9kZWw7XG4gICAgICAgICAgICBvdXQuY29udGV4dCA9IF8uZXh0ZW5kKHt9LCB0aGlzLmNvbnRleHQpO1xuXG4gICAgICAgICAgICAvLyBjcmVhdGUgYSBjb3B5IG9mIHRoZSB3aGVyZSBxdWVyeVxuICAgICAgICAgICAgaWYgKHRoaXMuY29udGV4dC53aGVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgb3V0LmNvbnRleHQud2hlcmUgPSB0aGlzLmNvbnRleHQud2hlcmUuY29weSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5jb250ZXh0LmNvbHVtbnMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG91dC5jb250ZXh0LmNvbHVtbnMgPSB0aGlzLmNvbnRleHQuY29sdW1ucy5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuY29udGV4dC5vcmRlciAmJiB0eXBlb2YodGhpcy5jb250ZXh0Lm9yZGVyKSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBvdXQuY29udGV4dC5vcmRlciA9IHRoaXMuY29udGV4dC5vcmRlci5zbGljZSgwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGZldGNoQ291bnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgc3ViX3NlbGVjdCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuZGF0YSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGF0YS5yZXR1cm5pbmcgPSAnY291bnQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSB7cmV0dXJuaW5nOiAnY291bnQnfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdWJfc2VsZWN0LmZldGNoKG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIGNvbnRleHQgPSB7fTtcblxuICAgICAgICAgICAgLy8gc2V0dXAgdGhlIHdoZXJlIHF1ZXJ5XG4gICAgICAgICAgICB2YXIgd2hlcmUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAodGhpcy5jb250ZXh0LndoZXJlKSB7XG4gICAgICAgICAgICAgICAgd2hlcmUgPSB0aGlzLmNvbnRleHQud2hlcmUuYW5kKG9wdGlvbnMud2hlcmUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvcHRpb25zLndoZXJlKSB7XG4gICAgICAgICAgICAgICAgd2hlcmUgPSBvcHRpb25zLndoZXJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdoZXJlICYmICF3aGVyZS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQud2hlcmUgPSB3aGVyZS50b0pTT04oKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0dXAgdGhlIHJlc3Qgb2YgdGhlIGNvbnRleHQgb3B0aW9uc1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMubGltaXQgfHwgdGhpcy5jb250ZXh0LmxpbWl0KSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC5saW1pdCA9IG9wdGlvbnMubGltaXQgfHwgdGhpcy5jb250ZXh0LmxpbWl0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG9wdGlvbnMub3JkZXIgfHwgdGhpcy5jb250ZXh0Lm9yZGVyKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC5vcmRlciA9IG9wdGlvbnMub3JkZXIgfHwgdGhpcy5jb250ZXh0Lm9yZGVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG9wdGlvbnMuZXhwYW5kIHx8IHRoaXMuY29udGV4dC5leHBhbmQpIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0LmV4cGFuZCA9IG9wdGlvbnMuZXhwYW5kIHx8IHRoaXMuY29udGV4dC5leHBhbmQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgY29udGV4dCBzcGVjaWZpYyBvcHRpb25zLCB1cGRhdGUgdGhlIHJvb3QgcXVlcnlcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGNvbnRleHQpKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5kYXRhID0gXy5leHRlbmQoe2NvbnRleHQ6IEpTT04uc3RyaW5naWZ5KGNvbnRleHQpfSwgb3B0aW9ucy5kYXRhKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2FsbCB0aGUgYmFzZSBjb2xsZWN0aW9uIGNvbnRleHQgY29tbWFuZHNcbiAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Db2xsZWN0aW9uLnByb3RvdHlwZS5mZXRjaC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBmZXRjaE9uZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgdmFyIG5ld19jb2xsZWN0aW9uID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICB2YXIgb3B0cyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgbGltaXQ6IDEsXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3Rpb24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5zdWNjZXNzKGNvbGxlY3Rpb24uYXQoMCksIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnN1Y2Nlc3ModW5kZWZpbmVkLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ld19jb2xsZWN0aW9uLmZldGNoKG9wdHMpO1xuICAgICAgICB9LFxuICAgICAgICByZWZpbmU6IGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG5cbiAgICAgICAgICAgIC8vIG1lcmdlIHRoZSB3aGVyZSBjb250ZXh0c1xuICAgICAgICAgICAgaWYgKG91dC5jb250ZXh0LndoZXJlKSB7XG4gICAgICAgICAgICAgICAgb3V0LmNvbnRleHQud2hlcmUgPSBvdXQuY29udGV4dC53aGVyZS5hbmQoY29udGV4dC53aGVyZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbnRleHQud2hlcmUpIHtcbiAgICAgICAgICAgICAgICBvdXQuY29udGV4dC53aGVyZSA9IGNvbnRleHQud2hlcmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSB0aGUgd2hlcmUgb3B0aW9uXG4gICAgICAgICAgICBkZWxldGUgY29udGV4dC53aGVyZTtcblxuICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgb3RoZXIgb3B0aW9uc1xuICAgICAgICAgICAgb3V0LmNvbnRleHQgPSBfLmV4dGVuZChvdXQuY29udGV4dCwgY29udGV4dClcblxuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgdXJsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdXJsID0gKHR5cGVvZih0aGlzLnVybFJvb3QpID09PSAnc3RyaW5nJykgPyB0aGlzLnVybFJvb3QgOiB0aGlzLnVybFJvb3QoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbnRleHQudmlldykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzLnJ0cmltKHVybCwgJy8nKSArICcvJyArIHRoaXMuY29udGV4dC52aWV3O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdXJsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59KSh3aW5kb3cub3JiLCBqUXVlcnkpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLk1vZGVsID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICAgICAgICAvLyBpbml0aWFsaXplIGluZm9ybWF0aW9uIGZyb20gdGhlIHNjaGVtYVxuICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzID0ge307XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgcmVmZXJlbmNlIGluZm9ybWF0aW9uXG4gICAgICAgICAgICB2YXIgc2NoZW1hID0gc2VsZi5jb25zdHJ1Y3Rvci5zY2hlbWE7XG4gICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgXy5mb3JFYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2x1bW4udHlwZSA9PT0gJ1JlZmVyZW5jZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIF8uZm9yRWFjaChzY2hlbWEuY29sbGVjdG9ycywgZnVuY3Rpb24gKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdG9yLmZsYWdzLlVuaXF1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtb2RlbCA9IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2xsZWN0b3IubW9kZWxdO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZHMgPSBuZXcgIG1vZGVsLmNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMudXJsUm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcm9vdCA9IHNlbGYudXJsUm9vdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkX2lkID0gc2VsZi5nZXQoJ2lkJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEocm9vdCAmJiByZWNvcmRfaWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRyaW1tZWQgPSBzLnRyaW0oc2VsZi51cmxSb290LCAnLycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJpbW1lZCArICcvJyArIHJlY29yZF9pZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZltjb2xsZWN0b3IubmFtZV0gPSByZWNvcmRzO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNhbGwgdGhlIGJhc2UgY2xhc3MncyBtZXRob2RcbiAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IHRoaXMuY29uc3RydWN0b3Iuc2NoZW1hO1xuICAgICAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgICAgICAgIHZhciBjb2xsZWN0b3IgPSBzY2hlbWEuY29sbGVjdG9yc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgIHZhciBjb2x1bW4gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgXy5mb3JFYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2wudHlwZSA9PT0gJ1JlZmVyZW5jZScgJiYgY29sLm5hbWUgPT09IGF0dHJpYnV0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uID0gY29sO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBnZXQgYSByZWZlcmVuY2UgY29sdW1uXG4gICAgICAgICAgICAgICAgaWYgKGNvbHVtbiAmJiBjb2x1bW4udHlwZSA9PT0gJ1JlZmVyZW5jZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZCA9IHRoaXMucmVmZXJlbmNlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVjb3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZCA9IG5ldyBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sdW1uLnJlZmVyZW5jZV0oe2lkOiBzZWxmLmF0dHJpYnV0ZXNbY29sdW1uLmZpZWxkXX0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZWZlcmVuY2VzW2NvbHVtbi5uYW1lXSA9IHJlY29yZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGdldCBhIGNvbGxlY3Rpb24gb2Ygb2JqZWN0c1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNvbGxlY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdG9yLmZsYWdzLlVuaXF1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY29yZCA9IHRoaXMucmVmZXJlbmNlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2xsZWN0b3IubW9kZWxdKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkLnVybFJvb3QgPSB0aGlzLnVybCgpICsgJy8nICsgbmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlZmVyZW5jZXNbYXR0cmlidXRlXSA9IHJlY29yZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQ7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gZ2V0IGEgcmVndWxhciBhdHRyaWJ1dGVcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5nZXQuY2FsbCh0aGlzLCBhdHRyaWJ1dGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZ2V0IGEgcmVndWxhciBhdHRyaWJ1dGVcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUuZ2V0LmNhbGwodGhpcywgYXR0cmlidXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcGFyc2U6IGZ1bmN0aW9uIChyZXNwb25zZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIHNjaGVtYSA9IHNlbGYuY29uc3RydWN0b3Iuc2NoZW1hO1xuXG4gICAgICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgLy8gbG9hZCByZWZlcmVuY2VzXG4gICAgICAgICAgICAgICAgXy5mb3JFYWNoKHNjaGVtYS5jb2x1bW5zLCBmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2x1bW4udHlwZSA9PT0gJ1JlZmVyZW5jZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2VbY29sdW1uLm5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHJlc3BvbnNlW2NvbHVtbi5uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlbGYucmVmZXJlbmNlc1tjb2x1bW4ubmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbHVtbi5uYW1lXSA9IG5ldyBzY2hlbWEucmVmZXJlbmNlU2NvcGVbY29sdW1uLnJlZmVyZW5jZV0oZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2NvbHVtbi5uYW1lXS51cGRhdGUoZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBsb2FkIGNvbGxlY3RvcnNcbiAgICAgICAgICAgICAgICBfLmZvckVhY2goc2NoZW1hLmNvbGxlY3RvcnMsIGZ1bmN0aW9uIChjb2xsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRhdGEgPSByZXNwb25zZVtjb2xsZWN0b3IubmFtZV07XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSByZXNwb25zZVtjb2xsZWN0b3IubmFtZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdG9yLmZsYWdzLlVuaXF1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2VsZi5yZWZlcmVuY2VzW2NvbGxlY3Rvci5uYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLnJlZmVyZW5jZXNbY29sbGVjdG9yLm5hbWVdID0gbmV3IHNjaGVtYS5yZWZlcmVuY2VTY29wZVtjb2xsZWN0b3IubW9kZWxdKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYucmVmZXJlbmNlc1tjb2xsY3Rvci5uYW1lXS51cGRhdGUoZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVjb3JkcyA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBkYXRhO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZHMgPSBkYXRhLnJlY29yZHM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY29yZHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmW2NvbGxlY3Rvci5uYW1lXS5zZXQocmVjb3Jkcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHByb2Nlc3MgdGhlIGJhc2UgY2FsbFxuICAgICAgICAgICAgcmV0dXJuIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS5wYXJzZS5jYWxsKHRoaXMsIHJlc3BvbnNlLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAoYXR0cmlidXRlcywgb3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgXy5mb3JFYWNoKGF0dHJpYnV0ZXMsIGZ1bmN0aW9uICh2YWx1ZSwgYXR0cmlidXRlKSB7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHJlZmVyZW5jZSBpbmZvcm1hdGlvblxuICAgICAgICAgICAgICAgIGlmIChfLmhhc093blByb3BlcnR5KHNlbGYucmVmZXJlbmNlcywgYXR0cmlidXRlKSkge1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgYXR0cmlidXRlc1thdHRyaWJ1dGVdO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIG9yYi5Nb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZWZlcmVuY2VzW2F0dHJpYnV0ZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWYgPSBzZWxmLmdldChhdHRyaWJ1dGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVmLnVwZGF0ZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBzZXQgY29sbGVjdGlvbiBpbmZvcm1hdGlvblxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKF8uaGFzT3duUHJvcGVydHkoc2VsZiwgYXR0cmlidXRlKSkge1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgYXR0cmlidXRlc1thdHRyaWJ1dGVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBvcmIuQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZlthdHRyaWJ1dGVdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmW2F0dHJpYnV0ZV0uc2V0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gQmFja2JvbmUuTW9kZWwucHJvdG90eXBlLnNldC5jYWxsKHRoaXMsIGF0dHJpYnV0ZXMsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICB1bnNldDogZnVuY3Rpb24gKGF0dHJpYnV0ZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgLy8gdW5zZXQgYSByZWZlcmVuY2Ugb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5yZWZlcmVuY2VzW25hbWVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IHRoaXMucmVmZXJlbmNlc1tuYW1lXVxuICAgICAgICAgICAgICAgIGRlbGV0ZSBkYXRhO1xuICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucy5zaWxlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdjaGFuZ2U6JyArIG5hbWUsIGRhdGEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdW5zZXQgYSBjb2xsZWN0aW9uXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzW2F0dHJpYnV0ZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXNbYXR0cmlidXRlXS5yZXNldCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB1bnNldCBhbiBhdHRyaWJ1dGVcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIEJhY2tib25lLk1vZGVsLnByb3RvdHlwZS51bnNldC5jYWxsKHRoaXMsIGF0dHJpYnV0ZSwgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHVybDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuY29sbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIHZhciBpZCA9IHRoaXMuZ2V0KCdpZCcpO1xuICAgICAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb2xsZWN0aW9uLnVybCgpICsgJy8nICsgaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbi51cmwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBCYWNrYm9uZS5Nb2RlbC5wcm90b3R5cGUudXJsLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIHNjaGVtYTogdW5kZWZpbmVkLFxuICAgICAgICBjb2xsZWN0aW9uOiBvcmIuQ29sbGVjdGlvbixcbiAgICAgICAgYWxsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0KG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBzZWxlY3Q6IGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkcyA9IG5ldyB0aGlzLmNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgIHJlY29yZHMuY29udGV4dCA9IF8uZXh0ZW5kKHt9LCByZWNvcmRzLmNvbnRleHQsIGNvbnRleHQpO1xuICAgICAgICAgICAgcmVjb3Jkcy51cmxSb290ID0gdGhpcy5wcm90b3R5cGUudXJsUm9vdDtcbiAgICAgICAgICAgIHJlY29yZHMubW9kZWwgPSB0aGlzO1xuICAgICAgICAgICAgcmV0dXJuIHJlY29yZHM7XG4gICAgICAgIH0sXG4gICAgICAgIGJ5SWQ6IGZ1bmN0aW9uIChpZCwgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgcSA9IG5ldyBvcmIuUSgnaWQnKS5pcyhpZCk7XG4gICAgICAgICAgICBvcHRpb25zLndoZXJlID0gcS5hbmQob3B0aW9ucy53aGVyZSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3QoKS5mZXRjaE9uZShvcHRpb25zKTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYik7IiwiKGZ1bmN0aW9uIChvcmIpIHtcbiAgICAvLyBkZWZpbmUgdGhlIGJhc2UgcXVlcnkgdHlwZVxuICAgIG9yYi5RID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG9wOiAnPT0nLFxuICAgICAgICAgICAgY29sdW1uOiB1bmRlZmluZWQsXG4gICAgICAgICAgICB0YWJsZTogJycsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiBmYWxzZSxcbiAgICAgICAgICAgIGZ1bmN0aW9uczogdW5kZWZpbmVkLFxuICAgICAgICAgICAgbWF0aDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgaW52ZXJ0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgdmFsdWU6IHVuZGVmaW5lZFxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZihvcHRpb25zKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnY29sdW1uJywgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZXQoJ2Z1bmN0aW9ucycpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldCgnZnVuY3Rpb25zJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KCdtYXRoJykgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KCdtYXRoJywgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhZnRlcjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkFmdGVyKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgYWJzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KHRoaXMuRnVuY3Rpb24uQWJzKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGFuZDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIgPT09IHVuZGVmaW5lZCB8fCBvdGhlci5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG90aGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe1xuICAgICAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3AuQW5kLFxuICAgICAgICAgICAgICAgICAgICBxdWVyaWVzOiBbdGhpcywgb3RoZXJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFzU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQubW9kaWZ5KG9yYi5RLk9wLkFzU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJlZm9yZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJlZm9yZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJldHdlZW46IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkJldHdlZW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCBbYSwgYl0pO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgY29udGFpbnM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuQ29udGFpbnMpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXR0cnMgPSBfLmV4dGVuZCh7fSwgdGhpcy5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGF0dHJzWydmdW5jdGlvbnMnXSA9IGF0dHJzWydmdW5jdGlvbnMnXS5zbGljZSgwKTtcbiAgICAgICAgICAgIGF0dHJzWydtYXRoJ10gPSBhdHRyc1snbWF0aCddLnNsaWNlKDApO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUShhdHRycyk7XG5cbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdENvbnRhaW46IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuRG9lc05vdENvbnRhaW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICBvdXQuc2V0KCdjYXNlU2Vuc2l0aXZlJywgY2FzZVNlbnNpdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBkb2VzTm90RW5kd2l0aDogZnVuY3Rpb24gKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RFbmR3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZG9lc05vdE1hdGNoOiBmdW5jdGlvbiAodmFsdWUsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICAgIHZhciBjYXNlU2Vuc2l0aXZlID0gKGNhc2VTZW5zaXRpdmUgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGNhc2VTZW5zaXRpdmU7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkRvZXNOb3RNYXRjaCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ2Nhc2VTZW5zaXRpdmUnLCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGRvZXNOb3RTdGFydHdpdGg6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZSA9IChjYXNlU2Vuc2l0aXZlID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Eb2VzTm90U3RhcnR3aXRoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgZW5kc3dpdGg6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5FbmRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdyZWF0ZXJUaGFuOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuR3JlYXRlclRoYW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBncmVhdGVyVGhhbk9yRXF1YWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5HcmVhdGVyVGhhbk9yRXF1YWwpO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBpczogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgaXNOb3Q6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5Jc05vdCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLmdldCgnY29sdW1uJykgPT09IHVuZGVmaW5lZCB8fCB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkKTtcbiAgICAgICAgfSxcbiAgICAgICAgaXNVbmRlZmluZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldCgndmFsdWUnKSA9PT0gdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgICBpbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzSW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBub3RJbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLklzTm90SW4pO1xuICAgICAgICAgICAgb3V0LnNldCgndmFsdWUnLCB2YWx1ZS5zbGljZSgwKSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9LFxuICAgICAgICBsZXNzVGhhbjogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgb3V0ID0gdGhpcy5jb3B5KCk7XG4gICAgICAgICAgICBvdXQuc2V0KCdvcCcsIG9yYi5RLk9wLkxlc3NUaGFuKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUuc2xpY2UoMCkpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbGVzc1RoYW5PckVxdWFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuTGVzc1RoYW5PckVxdWFsKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbG93ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5tb2RpZnkodGhpcy5GdW5jdGlvbi5Mb3dlcik7XG4gICAgICAgIH0sXG4gICAgICAgIG1hdGNoZXM6IGZ1bmN0aW9uICh2YWx1ZSwgY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgICAgdmFyIGNhc2VTZW5zaXRpdmUgPSAoY2FzZVNlbnNpdGl2ZSA9PT0gdW5kZWZpbmVkKSA/IHRydWUgOiBjYXNlU2Vuc2l0aXZlO1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0LnNldCgnb3AnLCBvcmIuUS5PcC5NYXRjaGVzKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ3ZhbHVlJywgdmFsdWUpO1xuICAgICAgICAgICAgb3V0LnNldCgnY2FzZVNlbnNpdGl2ZScsIGNhc2VTZW5zaXRpdmUpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSxcbiAgICAgICAgbW9kaWZ5OiBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICAgICAgdGhpcy5nZXQoJ2Z1bmN0aW9ucycpLnB1c2goZnVuYyk7XG4gICAgICAgIH0sXG4gICAgICAgIG9yOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiBvcmIuUS5PcC5PcixcbiAgICAgICAgICAgICAgICAgICAgcXVlcmllczogW3RoaXMsIG90aGVyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBzdGFydHN3aXRoOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBvdXQgPSB0aGlzLmNvcHkoKTtcbiAgICAgICAgICAgIG91dC5zZXQoJ29wJywgb3JiLlEuT3AuU3RhcnRzd2l0aCk7XG4gICAgICAgICAgICBvdXQuc2V0KCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3F1ZXJ5JyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0KCdjb2x1bW4nKSxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdGhpcy5nZXQoJ3ZhbHVlJylcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBmdW5jcyA9IHRoaXMuZ2V0KCdmdW5jdGlvbnMnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGZ1bmNzKSkge1xuICAgICAgICAgICAgICAgIHZhciBqZnVuY3MgPSBbXTtcbiAgICAgICAgICAgICAgICBfLmVhY2goZnVuY3MsIGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIGpmdW5jcy5wdXNoKG9yYi5RLkZ1bmN0aW9uLmtleShmdW5jKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5mdW5jdGlvbnMgPSBqZnVuY3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXRoID0gdGhpcy5nZXQoJ21hdGgnKTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KG1hdGgpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGptYXRoID0gW107XG4gICAgICAgICAgICAgICAgXy5lYWNoKG1hdGgsIGZ1bmN0aW9uIChvcCkge1xuICAgICAgICAgICAgICAgICAgICBqbWF0aC5wdXNoKG9yYi5RLk1hdGgua2V5KG9wKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZGF0YS5tYXRoID0gam1hdGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgICB9LFxuICAgICAgICB1cHBlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG91dCA9IHRoaXMuY29weSgpO1xuICAgICAgICAgICAgb3V0Lm1vZGlmeSh0aGlzLkZ1bnRpb25zLlVwcGVyKTtcbiAgICAgICAgfVxuICAgIH0sIHtcbiAgICAgICAgT3A6IHtcbiAgICAgICAgICAgIElzOiAnPT0nLFxuICAgICAgICAgICAgSXNOb3Q6ICchPScsXG4gICAgICAgICAgICBMZXNzVGhhbjogJzwnLFxuICAgICAgICAgICAgTGVzc1RoYW5PckVxdWFsOiAnPD0nLFxuICAgICAgICAgICAgQmVmb3JlOiAnPCcsXG4gICAgICAgICAgICBHcmVhdGVyVGhhbjogJz4nLFxuICAgICAgICAgICAgR3JlYXRlclRoYW5PckVxdWFsOiAnPj0nLFxuICAgICAgICAgICAgQWZ0ZXI6ICc+JyxcbiAgICAgICAgICAgIEJldHdlZW46ICdiZXR3ZWVuJyxcbiAgICAgICAgICAgIENvbnRhaW5zOiAnY29udGFpbnMnLFxuICAgICAgICAgICAgRG9lc05vdENvbnRhaW46IFwiZG9lc24ndCBjb250YWluXCIsXG4gICAgICAgICAgICBTdGFydHN3aXRoOiAnc3RhcnRzd2l0aCcsXG4gICAgICAgICAgICBFbmRzd2l0aDogJ2VuZHN3aXRoJyxcbiAgICAgICAgICAgIE1hdGNoZXM6ICdtYXRjaGVzJyxcbiAgICAgICAgICAgIERvZXNOb3RNYXRjaDogXCJkb2Vzbid0IG1hdGNoXCIsXG4gICAgICAgICAgICBJc0luOiAnaXMgaW4nLFxuICAgICAgICAgICAgSXNOb3RJbjogJ2lzIG5vdCBpbicsXG4gICAgICAgICAgICBEb2VzTm90U3RhcnR3aXRoOiBcImRvZXNuJ3Qgc3RhcnR3aXRoXCIsXG4gICAgICAgICAgICBEb2VzTm90RW5kd2l0aDogXCJkb2Vzbid0IGVuZHdpdGhcIixcbiAgICAgICAgICAgIEFuZDogJ2FuZCcsXG4gICAgICAgICAgICBPcjogJ29yJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIE1hdGg6IHtcbiAgICAgICAgICAgIEFkZDogJysnLFxuICAgICAgICAgICAgU3VidHJhY3Q6ICctJyxcbiAgICAgICAgICAgIE11bHRpcGx5OiAnKicsXG4gICAgICAgICAgICBEaXZpZGU6ICcvJyxcbiAgICAgICAgICAgIEFuZDogJyYnLFxuICAgICAgICAgICAgT3I6ICd8JyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIEZ1bmN0aW9uOiB7XG4gICAgICAgICAgICBMb3dlcjogJ2xvd2VyJyxcbiAgICAgICAgICAgIFVwcGVyOiAndXBwZXInLFxuICAgICAgICAgICAgQWJzOiAnYWJzJyxcbiAgICAgICAgICAgIEFzU3RyaW5nOiAnc3RyJyxcblxuICAgICAgICAgICAga2V5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIF8uZmluZCh0aGlzLCBmdW5jdGlvbiAodiwgaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IGs7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5RQ29tcG91bmQgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICAgICAgICBkZWZhdWx0czoge1xuICAgICAgICAgICAgb3A6ICdBbmQnXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMucXVlcmllcyA9IG9wdGlvbnMucXVlcmllcyB8fCBuZXcgb3JiLkNvbGxlY3Rpb24oKTtcbiAgICAgICAgfSxcbiAgICAgICAgYW5kOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgICAgIGlmIChvdGhlciA9PT0gdW5kZWZpbmVkIHx8IG90aGVyLmlzTnVsbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3RoZXI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2V0KCdvcCcpID09PSBvcmIuUS5PcC5BbmQpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3X3F1ZXJpZXMgPSB0aGlzLnF1ZXJpZXMuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgbmV3X3F1ZXJpZXMucHVzaChvdGhlcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBvcmIuUUNvbXBvdW5kKHtvcDogb3JiLlEuT3AuQW5kLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5BbmQsIHF1ZXJpZXM6IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKFt0aGlzLCBvdGhlcl0pfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNvcHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIG9wOiB0aGlzLmdldCgnb3AnKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiB0aGlzLnF1ZXJpZXMuc2xpY2UoMClcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQob3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTnVsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFtX251bGwgPSB0cnVlO1xuICAgICAgICAgICAgXy5lYWNoKHRoaXMucXVlcmllcywgZnVuY3Rpb24gKHN1YnF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdWJxdWVyeS5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgICAgICBhbV9udWxsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYW1fbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgb3I6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICAgICAgaWYgKG90aGVyID09PSB1bmRlZmluZWQgfHwgb3RoZXIuaXNOdWxsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc051bGwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvdGhlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nZXQoJ29wJykgPT09IG9yYi5RLk9wLk9yKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld19xdWVyaWVzID0gdGhpcy5xdWVyaWVzLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIG5ld19xdWVyaWVzLnB1c2gob3RoZXIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLlFDb21wb3VuZCh7b3A6IG9yYi5RLk9wLk9yLCBxdWVyaWVzOiBuZXdfcXVlcmllc30pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi5RQ29tcG91bmQoe29wOiBvcmIuUS5PcC5PciwgcXVlcmllczogW3RoaXMsIG90aGVyXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2NvbXBvdW5kJyxcbiAgICAgICAgICAgICAgICBvcDogb3JiLlEuT3Aua2V5KHRoaXMuZ2V0KCdvcCcpKSxcbiAgICAgICAgICAgICAgICBxdWVyaWVzOiB0aGlzLnF1ZXJpZXMudG9KU09OKClcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KTtcbn0pKHdpbmRvdy5vcmIpOyIsIihmdW5jdGlvbiAob3JiLCAkKSB7XG4gICAgb3JiLkluZGV4ID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZGJuYW1lOiAnJyxcbiAgICAgICAgICAgIHVuaXF1ZTogZmFsc2UsXG4gICAgICAgICAgICBvcmRlcjogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY2FjaGVkOiBmYWxzZSxcbiAgICAgICAgICAgIHRpbWVvdXQ6IDBcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oe21vZGVsOiBvcmIuQ29sdW1ufSk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdldCgnbmFtZScpLFxuICAgICAgICAgICAgICAgIGRibmFtZTogdGhpcy5nZXQoJ2RibmFtZScpLFxuICAgICAgICAgICAgICAgIHVuaXF1ZTogdGhpcy5nZXQoJ3VuaXF1ZScpLFxuICAgICAgICAgICAgICAgIG9yZGVyOiB0aGlzLmdldCgnb3JkZXInKSxcbiAgICAgICAgICAgICAgICBjYWNoZWQ6IHRoaXMuZ2V0KCdjYWNoZWQnKSxcbiAgICAgICAgICAgICAgICB0aW1lb3V0OiB0aGlzLmdldCgndGltZW91dCcpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIG9yYi5QaXBlID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgdGhyb3VnaDogJycsXG4gICAgICAgICAgICBmcm9tOiAnJyxcbiAgICAgICAgICAgIHRvOiAnJyxcbiAgICAgICAgICAgIHVuaXF1ZTogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgdG9KU09OOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgdGhyb3VnaDogdGhpcy5nZXQoJ3Rocm91Z2gnKSxcbiAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmdldCgnZnJvbScpLFxuICAgICAgICAgICAgICAgIHRvOiB0aGlzLmdldCgndG8nKSxcbiAgICAgICAgICAgICAgICB1bmlxdWU6IHRoaXMuZ2V0KCd1bmlxdWUnKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLkNvbHVtbiA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICAgIG5hbWU6ICcnLFxuICAgICAgICAgICAgZmllbGQ6ICcnLFxuICAgICAgICAgICAgZGlzcGxheTogJycsXG4gICAgICAgICAgICByZWZlcmVuY2U6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGluZGV4OiB1bmRlZmluZWQsXG4gICAgICAgICAgICBmbGFnczogMCxcbiAgICAgICAgICAgIGRlZmF1bHQ6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogJ2FzYydcbiAgICAgICAgfSxcbiAgICAgICAgdGVzdEZsYWc6IGZ1bmN0aW9uIChmbGFnKSB7XG4gICAgICAgICAgICByZXR1cm4gKHNlbGYuZ2V0KCdmbGFncycpICYgZmxhZykgPiAwO1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMuZ2V0KCdpbmRleCcpO1xuICAgICAgICAgICAgdmFyIGluZGV4X2pzb24gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpbmRleF9qc29uID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBpbmRleC5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVkOiBpbmRleC5nZXQoJ2NhY2hlZCcpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0OiBpbmRleC5nZXQoJ3RpbWVvdXQnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiB0aGlzLmdldCgndHlwZScpLFxuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ2V0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgZmllbGQ6IHRoaXMuZ2V0KCdmaWVsZCcpLFxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IHRoaXMuZ2V0KCdkaXNwbGF5JyksXG4gICAgICAgICAgICAgICAgZmxhZ3M6IHRoaXMuZ2V0KCdmbGFncycpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHRPcmRlcjogdGhpcy5nZXQoJ2RlZmF1bHRPcmRlcicpLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHRoaXMuZ2V0KCdkZWZhdWx0JyksXG4gICAgICAgICAgICAgICAgaW5kZXg6IGluZGV4X2pzb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIEZsYWdzOiB7XG4gICAgICAgICAgICBSZWFkT25seTogICAgICAgTWF0aC5wb3coMiwgMCksXG4gICAgICAgICAgICBQcml2YXRlOiAgICAgICAgTWF0aC5wb3coMiwgMSksXG4gICAgICAgICAgICBQb2x5bW9ycGhpYzogICAgTWF0aC5wb3coMiwgMiksXG4gICAgICAgICAgICBQcmltYXJ5OiAgICAgICAgTWF0aC5wb3coMiwgMyksXG4gICAgICAgICAgICBBdXRvaW5jcmVtZW50OiAgTWF0aC5wb3coMiwgNCksXG4gICAgICAgICAgICBSZXF1aXJlZDogICAgICAgTWF0aC5wb3coMiwgNSksXG4gICAgICAgICAgICBVbmlxdWU6ICAgICAgICAgTWF0aC5wb3coMiwgNiksXG4gICAgICAgICAgICBFbmNyeXB0ZWQ6ICAgICAgTWF0aC5wb3coMiwgNyksXG4gICAgICAgICAgICBTZWFyY2hhYmxlOiAgICAgTWF0aC5wb3coMiwgOCksXG4gICAgICAgICAgICBUcmFuc2xhdGFibGU6ICAgTWF0aC5wb3coMiwgOSksXG4gICAgICAgICAgICBDYXNlU2Vuc2l0aXZlOiAgTWF0aC5wb3coMiwgMTApLFxuICAgICAgICAgICAgVmlydHVhbDogICAgICAgIE1hdGgucG93KDIsIDExKSxcbiAgICAgICAgICAgIFF1ZXJ5YWJsZTogICAgICBNYXRoLnBvdygyLCAxMilcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3JiLlNjaGVtYSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gICAgICAgIGRlZmF1bHRzOiB7XG4gICAgICAgICAgICBuYW1lOiAnJyxcbiAgICAgICAgICAgIGFic3RyYWN0OiBmYWxzZSxcbiAgICAgICAgICAgIGRibmFtZTogJycsXG4gICAgICAgICAgICBkaXNwbGF5OiAnJyxcbiAgICAgICAgICAgIGluaGVyaXRzOiAnJyxcbiAgICAgICAgICAgIHR5cGU6ICcnXG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMuY29tcGFyYXRvciA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2RlbC5nZXQoJ25hbWUnKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5pbmRleGVzID0gbmV3IEJhY2tib25lLkNvbGxlY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMuaW5kZXhlcy5jb21wYXJhdG9yID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZGVsLmdldCgnbmFtZScpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5waXBlcyA9IG5ldyBCYWNrYm9uZS5Db2xsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnBpcGVzLmNvbXBhcmF0b3IgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbW9kZWwuZ2V0KCduYW1lJyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdGhpcy5nZXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICBhYnN0cmFjdDogdGhpcy5nZXQoJ2Fic3RyYWN0JyksXG4gICAgICAgICAgICAgICAgZGJuYW1lOiB0aGlzLmdldCgnZGJuYW1lJyksXG4gICAgICAgICAgICAgICAgZGlzcGxheTogdGhpcy5nZXQoJ2Rpc3BsYXknKSxcbiAgICAgICAgICAgICAgICBpbmhlcml0czogdGhpcy5nZXQoJ2luaGVyaXRzJyksXG4gICAgICAgICAgICAgICAgY29sdW1uczogdGhpcy5jb2x1bW5zLnRvSlNPTigpLFxuICAgICAgICAgICAgICAgIGluZGV4ZXM6IHRoaXMuaW5kZXhlcy50b0pTT04oKSxcbiAgICAgICAgICAgICAgICBwaXBlczogdGhpcy5waXBlcy50b0pTT04oKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0pO1xufSkod2luZG93Lm9yYiwgalF1ZXJ5KTsiLCJ3aW5kb3cub3JiLnVpID0gd2luZG93Lm9yYi51aSB8fCB7fTtcblxucmVxdWlyZSgnLi9xdWVyeV9idWlsZGVyLmpzJyk7IiwiaWYgKHdpbmRvdy5NYXJpb25ldHRlKSB7XG4gICAgKGZ1bmN0aW9uIChvcmIsIE1hcmlvbmV0dGUsICQpIHtcbiAgICAgICAgb3JiLnVpLlF1ZXJ5SXRlbSA9IE1hcmlvbmV0dGUuSXRlbVZpZXcuZXh0ZW5kKHtcbiAgICAgICAgICAgIHRhZ05hbWU6ICdsaScsXG4gICAgICAgICAgICBtb2RlbDogb3JiLlF1ZXJ5LFxuICAgICAgICAgICAgdGVtcGxhdGU6IF8udGVtcGxhdGUoXG4gICAgICAgICAgICAgICAgJzxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwXCI+JyArXG4gICAgICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwiaW5wdXQtZ3JvdXBcIj4nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwiaW5wdXQtZ3JvdXAtYnRuXCI+JyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJzxidXR0b24gY2xhc3M9XCJidG4gYnRuLWRlZmF1bHQgcmVtb3ZlLWJ0blwiPjxzdHJvbmc+JnRpbWVzOzwvc3Ryb25nPjwvYnV0dG9uPicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJzwvZGl2PicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJzxpbnB1dCBjbGFzcz1cImZvcm0tY29udHJvbFwiIHZhbHVlPVwiPCUtIGNvbHVtbiAlPlwiLz4nICtcbiAgICAgICAgICAgICAgICAgICAgJzwvZGl2PicgK1xuICAgICAgICAgICAgICAgICAgICAnPHNlbGVjdCBjbGFzcz1cImZvcm0tY29udHJvbFwiIHZhbHVlPVwiPCUtIG9wICU+XCI+JyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnPG9wdGlvbj5Jczwvb3B0aW9uPicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJzxvcHRpb24+SXMgbm90PC9vcHRpb24+JyArXG4gICAgICAgICAgICAgICAgICAgICc8L3NlbGVjdD4nICtcbiAgICAgICAgICAgICAgICAgICAgJzxzcGFuIGlkPVwiZWRpdG9yXCI+JyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnPGlucHV0IGNsYXNzPVwiZm9ybS1jb250cm9sXCIgdmFsdWU9XCI8JS0gdmFsdWUgJT5cIi8+JyArXG4gICAgICAgICAgICAgICAgICAgICc8L3NwYW4+JyArXG4gICAgICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwiYnRuLWdyb3VwXCI+JyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnPGRpdiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdCBvcC1idG5cIiBkYXRhLW9wPVwiQW5kXCI+QW5kPC9kaXY+JyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnPGRpdiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdCBvcC1idG5cIiBkYXRhLW9wPVwiT3JcIj5PcjwvZGl2PicgK1xuICAgICAgICAgICAgICAgICAgICAnPC9kaXY+JyArXG4gICAgICAgICAgICAgICAgJzwvZGl2PidcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBldmVudHM6IHtcbiAgICAgICAgICAgICAgICAnY2xpY2sgLnJlbW92ZS1idG4nOiAndHJpZ2dlclJlbW92ZScsXG4gICAgICAgICAgICAgICAgJ2NsaWNrIC5vcC1idG4nOiAndHJpZ2dlck9wU3dpdGNoJyxcbiAgICAgICAgICAgICAgICAnY2xpY2sgLm9wLWJ0bic6ICd0cmlnZ2VyT3BTd2l0Y2gnXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdHJpZ2dlclJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcignYWN0aW9uOnJlbW92ZWQnKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0cmlnZ2VyT3BTd2l0Y2g6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgICAgIHZhciBvcCA9ICQoZXZlbnQudGFyZ2V0KS5kYXRhKCdvcCcpO1xuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcignYWN0aW9uOm9wLXN3aXRjaGVkJywgb3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBvcmIudWkuUXVlcnlDb21wb3VuZEl0ZW0gPSBNYXJpb25ldHRlLkl0ZW1WaWV3LmV4dGVuZCh7XG4gICAgICAgICAgICB0YWdOYW1lOiAnbGknLFxuICAgICAgICAgICAgbW9kZWw6IG9yYi5RdWVyeUNvbXBvdW5kLFxuICAgICAgICAgICAgdGVtcGxhdGU6IF8udGVtcGxhdGUoXG4gICAgICAgICAgICAgICAgJzxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwXCI+JyArXG4gICAgICAgICAgICAgICAgICAgICc8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi14c1wiPjxpIGNsYXNzPVwiZmEgZmEtcmVtb3ZlXCI+PC9pPjwvYnV0dG9uPicgK1xuICAgICAgICAgICAgICAgICAgICAnPHNwYW4+PGVtPkNvbXBvdW5kPC9lbT48L3NwYW4+JyArXG4gICAgICAgICAgICAgICAgICAgICc8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi14c1wiPjxpIGNsYXNzPVwiZmEgZmEtYXJyb3ctcmlnaHRcIj48L2k+PC9idXR0b24+JyArXG4gICAgICAgICAgICAgICAgJzwvZGl2PidcbiAgICAgICAgICAgIClcbiAgICAgICAgfSk7XG5cbiAgICAgICAgb3JiLnVpLlF1ZXJ5QnVpbGRlciA9IE1hcmlvbmV0dGUuQ29tcG9zaXRlVmlldy5leHRlbmQoe1xuICAgICAgICAgICAgdGFnTmFtZTogJ2RpdicsXG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiB7XG4gICAgICAgICAgICAgICAgY2xhc3M6ICdxdWVyeS1idWlsZGVyIGZvcm0gZm9ybS1pbmxpbmUnLFxuICAgICAgICAgICAgICAgIHJvbGU6ICdmb3JtJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNoaWxkVmlldzogZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgICAgICAgICBpZiAoaXRlbS5tb2RlbCBpbnN0YW5jZW9mIG9yYi5RKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgb3JiLnVpLlF1ZXJ5SXRlbShpdGVtKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IG9yYi51aS5RdWVyeUNvbXBvdW5kSXRlbShpdGVtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hpbGRWaWV3Q29udGFpbmVyOiAnI3F1ZXJ5LWl0ZW1zJyxcbiAgICAgICAgICAgIGNoaWxkRXZlbnRzOiB7XG4gICAgICAgICAgICAgICAgJ2FjdGlvbjpvcC1zd2l0Y2hlZCc6ICdzd2l0Y2hPcCcsXG4gICAgICAgICAgICAgICAgJ2FjdGlvbjpyZW1vdmVkJzogJ3JlbW92ZVF1ZXJ5J1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRlbXBsYXRlOiBfLnRlbXBsYXRlKFxuICAgICAgICAgICAgICAgICc8dWwgaWQ9XCJxdWVyeS1pdGVtc1wiIGNsYXNzPVwibGlzdC11bnN0eWxlZFwiPjwvdWw+J1xuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5zY2hlbWEgPSBvcHRpb25zLnNjaGVtYTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICByZW1vdmVRdWVyeTogZnVuY3Rpb24gKHF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY29sbGVjdGlvbi5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlvbi5yZW1vdmUocXVlcnkubW9kZWwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzd2l0Y2hPcDogZnVuY3Rpb24gKG9wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aW9uLmFkZChuZXcgb3JiLlEoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfSkod2luZG93Lm9yYiwgd2luZG93Lk1hcmlvbmV0dGUsICQpO1xufSJdfQ==
