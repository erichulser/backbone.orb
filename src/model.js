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