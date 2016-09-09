var util=require('./utils.js');
var MongoClient = require('mongodb').MongoClient;
var jpath = require('jsonpath');
var co=require('co');

var url = 'mongodb://10.0.0.90:27017/ulendiot';


setTimeout(function() {
    aggregate(0,function(err,result){
        aggregate(1,function(err,result){
            aggregate(2,function(err,result){

            });
        });
    });

}, 1000);

setInterval(function() {
    aggregate(0,function(err,result){
        aggregate(1,function(err,result){
            aggregate(2,function(err,result){

            });
        });
    });

}, 1000*60*2);

var aggregate = function(level,callback) {

        co(function*() {
            console.log("Aggregating level: " + level);
            var db = yield MongoClient.connect(url);

            var devices=yield db.collection('devices').find().toArray();

            for (var j=0;j<devices.length;j++){
                var device=devices[j];
                var device_string=util.device_string(device._id);
                console.log("Processing: " + device_string + ' for level:' + level);
                if (device.aggregations && device.levels) {
                    if (device.aggregations.length>level && device.levels.length>level) {
                        var adef = device.aggregations[level];

                        var level1=level+1;
                        var col_0 = "level" + level + "_" + device_string;
                        var col_1 = "level" + level1 + "_" + device_string;

                        var cutoff=new Date();
                        if (device.levels[level].duration == 'minute') {
                            cutoff=cutoff-(1000*60*10);//10 mins
                        }
                        if (device.levels[level].duration == 'hour') {
                            cutoff=cutoff-(1000*60*60*2);//2 hours
                        }
                        if (device.levels[level].duration == 'day') {
                            cutoff=cutoff-(1000*60*60*24*2);//2 days
                        }

                        var cursor = db.collection(col_0).find(
                            {
                                $or:[{processed: {$exists: false}},{processed: false}],
                                _id: {$lt:new Date(cutoff)}
                            }
                        ).sort({_id:1}).batchSize(1);

                        var count=0;
                        while(yield cursor.hasNext()) {
                            count+=1;
                            var doc=yield cursor.next();
                            var template = JSON.parse(JSON.stringify(adef));
                            traverseO(template, "$..[*]", doc, device.levels[level].duration);
                            var boundary;
                            var duration;

                            if (device.levels[level].duration == 'minute') {
                                boundary = new Date(doc._id);
                                boundary.setMinutes(0);
                                duration = 3600;
                            }
                            if (device.levels[level].duration == 'hour') {
                                boundary = new Date(doc._id);
                                boundary.setUTCHours(0);
                                duration = 3600*24;
                            }
                            if (device.levels[level].duration == 'day') {
                                boundary = new Date(doc._id);
                                boundary.setUTCHours(0);
                                duration = 3600*24*7;
                            }

                            var qry = {_id: new Date(boundary), duration: duration};
                            yield db.collection(col_1).updateOne(qry, {$push: {periods: template}}, {upsert: true});

                            qry = {_id: doc._id};
                            yield db.collection(col_0).updateOne(qry, {$set: {processed: true}});
                        }
                        console.log("Done processing: " + device_string + ' for level:' + level +' count: ' + count);

                        //delete older than retain
                        if (device.levels[level].retain)
                        {
                            console.log("Deleting old level:" + level + ' for ' + device_string);
                            var del=new Date();
                            del=del-(device.levels[level].retain*1000);
                            yield db.collection(col_0).remove({_id:{$lt: new Date(del)}})
                        }
                    } else {
                        console.log("Ignoring:" + device_string + ' at level ' + level + ' - no aggregation or level definition for level');
                    }
                } else {
                    console.log("Ignoring:" + device_string + ' at level ' + level + ' - no aggregation or level definition');
                }
            }

            db.close();
            console.log("Done aggregating level: " + level);
            if(callback){callback(null,true);}
        });
    };


function traverseO(obj, path, records, duration_text) {
    for ( prop in obj) {
        var new_path = path + "." + prop;

        if (Array.isArray(obj[prop])) {
            var ar = jpath.query(records, new_path);
            var vals={};
            for(var k=0;k<obj[prop].length;k++){
                var method_name;
                method = obj[prop][k];
                if(method=='mean_nozero'){method_name="mean";}else{method_name=method;}
                vals[duration_text + '_'+method_name]=calcAg(method,ar);
            }
            obj[prop]=vals;

        } else {
            var ar = jpath.query(records, new_path);
            if (typeof obj[prop]=="object") {
                traverseO(obj[prop], new_path, records, duration_text)
            }else{
                var method = obj[prop];
                obj[prop]=calcAg(method,ar)
            }
        }
    }
}

var calcAg=function(method,ar){
    switch (method) {
        case 'mean':
            val= ar.reduce(function (a, b) {return a + b;}, 0);
            if(val>0 && ar.length>0){return val/ar.length}else{return 0};
            break;
        case 'mean_nozero':
            return av_ignorezero(ar);
            break;
        case 'max':
            return  ar.reduce(function (a, b) {
                if(a==0){return b;}else{return Math.max(a,b);}
            }, 0);
        case 'min':
            return  ar.reduce(function (a, b) {
                if(a==0){return b;}else{return Math.min(a,b);}
            }, 0);
        case 'sum':
            return  ar.reduce(function (a, b) {
                return a + b;
            }, 0);
            break;
        case 'last':
            return  ar[ar.length - 1];
            break;
        case 'first':
            return  ar[0];
            break;
        case 'majority':
            return  mode(ar);
            break;
    }
};

var mode=function (ar) {
    var arr = ar.slice();
    return arr.sort(function (a, b) {
        return arr.filter(function (v) {
                return v === a
            }).length
            - arr.filter(function (v) {
                return v === b
            }).length
    }).pop();
};
var av_ignorezero=function(ar) {
    var count=0;
    var sum=ar.reduce(function(a,b){
        if(b>0){
            count+=1;
            return a+b;
        } else {
            return a;
        }
    },0);
    var res;
    if (count===0){res=0;}else{res=sum/count;}
    return res;
};
