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
            },
            error: options.error
        });
    }
};

require('./context');
require('./schema');
require('./collection');
require('./model');
require('./queries');