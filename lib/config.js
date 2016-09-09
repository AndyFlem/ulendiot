var util=require('./utils.js');

var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://10.0.0.90:27017/ulendiot';

module.exports= {
    config_get: function (device_name, callback) {
        MongoClient.connect(url, function (err, db) {
            if (err) {
                console.log(err);
                db.close();
            }

            device=util.device_from_string(device_name);
            var qry = {_id: device};
            db.collection('devices').findOne(qry, function (err, device) {
                if(err){
                    callback(err);
                }

                if(device){
                    if(device.config){
                        callback(undefined,device.config)

                    }else {
                        callback(new Error('Device config ' + device_name + ' not found.'));
                    }
                } else
                {
                    callback(new Error('Device ' + JSON.stringify(qry) + ' not found.'));
                }
                db.close();
            });
        });
    }
};


