require('./test-deps');

var chai = require('chai');


describe('create empty model', function () {
    var record = new orb.Model();

    it('should have no modified attributes', function () {
        chai.assert.equal(_.size(record.modifiedAttributes()), 0);
    });

    it('should have no url', function () {
        chai.assert.equal(record.urlRoot, undefined);
    });

    it('should have no defaults', function () {
        chai.assert.equal(_.size(record.attributes), 0);
    });
});


describe('custom model with defaults', function () {
    var User = orb.Model.extend({
        urlRoot: '/api/v1/users',
        defaults: {
            username: '',
            first_name: '',
            last_name: ''
        }
    });

    var record = new User();
    it('should have no modified attributes', function () {
        chai.assert.equal(_.size(record.modifiedAttributes()), 0);
    });

    it('should have a url', function () {
        chai.assert.equal(record.urlRoot, '/api/v1/users');
        chai.assert.equal(record.url(), '/api/v1/users');
    });

    it('should have defaults', function () {
        chai.assert.equal(record.attributes.username, '');
        chai.assert.equal(record.attributes.first_name, '');
        chai.assert.equal(record.attributes.last_name, '');
    });
});