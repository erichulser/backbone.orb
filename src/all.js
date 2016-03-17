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
            console.log('here!');
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