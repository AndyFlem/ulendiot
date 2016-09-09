var util = require('./utils.js');
var mqtt = require('mqtt');
var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://10.0.0.90:27017/ulendiot';
var db;
var mqtt_client;
var socket_send;


module.exports = {
    start: function (mqtt_server, socket_sender) {
        console.log("Monitor handler starting.");
        socket_send = socket_sender;
        socket_send.register_connect_callback(send_on_connect);

        MongoClient.connect(url, function (err, db_con) {
            if (err) {
                console.log(err)
            }
            db = db_con;
        });
        mqtt_client = mqtt.connect(mqtt_server);

        mqtt_client.on('connect', function () {
            mqtt_client.subscribe('/+/+/+/monitor');
        });

        mqtt_client.on('message', function (topic, message) {
            process_monitor(topic, message, function (err, response) {
                if (err) {
                    console.log(err);
                }
            });
        });
    }
};


var process_monitor = function (monitor_topic, message, callback) {
    try {
        monitor_data = JSON.parse(message.toString());
    } catch (err) {
        callback(new Error("Couldn't parse monitor message with topic:" + monitor_topic));
        return;
    }

    var device = util.device_from_topic(monitor_topic);
    var device_string = util.device_string(device);

    //Checks
    if (!device || !monitor_data.timestamp) {
        callback(new Error("State message: " + monitor_topic + " malformed."));
        return;
    }

    //Get the last monitor and state records for this device
    var qry = {_id: device};
    db.collection('devices').findOne(qry, function (err, device_doc) {
        if (err) {
            callback(err);
            return;
        }

        if (!device_doc) {
            callback(new Error("Device record for: " + monitor_topic + " not found."));
            return;
        }

        var last_mon = device_doc.monitor;
        var last_state = device_doc.state;

        //Determine the collection
        var collection = "level0_" + device_string;

        //Determine the record id
        var monitor_timestamp = new Date(monitor_data.timestamp);
        monitor_timestamp.setMilliseconds(0);
        var boundary = (new Date(monitor_timestamp)).setSeconds(0);

        var period_end = boundary + ((Math.floor((monitor_timestamp - boundary) / device_doc.sample_duration) + 1) * device_doc.sample_duration);
        var period_start = period_end - device_doc.sample_duration;

        monitor_data.period_no = (Math.floor((monitor_timestamp - boundary) / device_doc.sample_duration)) + 1;
        monitor_data.period_start = new Date(period_start);
        monitor_data.period_end = new Date(period_end);
        monitor_data.timestamp = new Date(monitor_data.timestamp);
        monitor_data.duration = Math.round(device_doc.sample_duration / 1000);
        monitor_data.state = last_state.state;
        monitor_data.state_description = last_state.state_description;
        var state_duration = Math.round((monitor_data.timestamp - last_state._id.timestamp) / 1000);
        monitor_data.state_duration = state_duration;
        if (state_duration <= 120) {
            monitor_data.state_duration_text = state_duration + ' sec';
        }
        if (state_duration > 120 && state_duration <= 60 * 60) {
            monitor_data.state_duration_text = Math.round(state_duration / 60) + ' min';
        }
        if (state_duration > 60 * 60) {
            monitor_data.state_duration_text = (state_duration / 60 / 60).toFixed(1) + ' hour';
        }

        //Insert a new record
        if (!monitor_data.no_persist) {
            var qry = {_id: new Date(boundary), duration: 60};
            db.collection(collection).updateOne(qry, {$push: {periods: monitor_data}}, {upsert: true}, function (err, result) {
                if (err) {
                    callback(err);
                    return;
                }
            });

            //update the last monitor record on the device
            qry = {_id: device};
            db.collection('devices').update(qry, {$set: {monitor: monitor_data}}, {upsert: true}, function (err, result) {
                if (err) {
                    callback(err);
                    return;
                }
            });
        }

        socket_send.send(device, 'monitor', monitor_data, function (err, result) {
            if (err) {
                callback(err);
                return;
            }
        });

        callback(null, true);
        return;
    });
};


var send_on_connect = function () {
    console.log("Sending monitor data for client connect");
    db.collection('devices').find().toArray(function (err, devices) {
        for (var j=0;j<devices.length;j++) {
            socket_send.send(devices[j]._id, 'monitor', devices[j].monitor);
        }
    });
};