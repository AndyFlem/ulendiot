var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://10.0.0.90:27017/ulendiot';

module.exports= {
    dashboard_get: function (dashboard_name, callback) {
        MongoClient.connect(url, function (err, db) {
            if (err) {
                console.log(err)
            }

            var qry = {_id: dashboard_name};
            db.collection('dashboards').findOne(qry, function (err, dashboard) {
                if(err){
                    callback(err);
                }
                if(dashboard){
                    callback(undefined,dashboard.definition)

                } else
                {
                    callback(new Error('Dashboard: ' + dashboard_name + ' not found.'));
                }
                db.close();
            });
        });
    }
}