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