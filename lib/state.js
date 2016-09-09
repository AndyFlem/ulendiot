var util=require('./utils.js');
var mqtt = require('mqtt');
var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://10.0.0.90:27017/ulendiot';
var db;
var mqtt_client;
var last_state;
var socket_send;

module.exports = {
    start: function (mqtt_server,socket_sender) {
        console.log("State handler starting.");
        socket_send=socket_sender;

        MongoClient.connect(url, function (err, db_con) {
            if (err) {
                console.log(err)
            }
            db = db_con;
        });
        mqtt_client = mqtt.connect(mqtt_server);

        mqtt_client.on('connect', function () {
            mqtt_client.subscribe('/+/+/+/state');
        });

        mqtt_client.on('message', function (topic, message) {
            var msg;
            try{
                msg=JSON.parse(message.toString());
            } catch (err){
                console.log("Couldn't parse state message with topic:" + topic);
                msg=null;
            }
            if (msg){
                var wait;
                if((new Date())-last_state<1000){wait=1000;}else{wait=0;}
                setTimeout(function() {
                    process_state(topic,msg, function(err,response){
                        if(err)
                        {
                            console.log(err);
                        }else {
                            console.log("Processed state message with topic:" + topic)
                        }
                    });
                    last_state=new Date();
                }, wait);

            }
        });
    }
};

var process_state= function (state_topic,state_data, callback) {

    var device=util.device_from_topic(state_topic);
    var device_string=util.device_string(device);

    //Checks
    if(!device || !state_data.timestamp){
        callback(new Error("State message: " + state_topic + " malformed."));
        return;
    }

    var qry = {_id: device};
    db.collection('devices').findOne(qry, function (err, device_doc) {
        if (err) {callback(err); return;}

        if(!device_doc.state) {
            callback(new Error("Device record for: " + state_topic + " not found."));
            return;
        }

        var last_state = device_doc.state;

        //Check for modified state
        if (JSON.stringify(last_state.state)!=JSON.stringify(state_data.state)){
            console.log("Detected state change: " + device_string);
            state_data._id={device: device, timestamp: new Date(state_data.timestamp)};
            delete state_data.timestamp;
            state_data.previous_state=last_state.state;
            state_data.previous_state_description=last_state.state_description;
            state_data.duration=Math.round((state_data._id.timestamp-last_state._id.timestamp)/1000);
            if (state_data.duration<=120){
                state_data.duration_text=state_data.duration+' sec';
            }
            if (state_data.duration>120 && state_data.duration<=60*60){
                state_data.duration_text=Math.round(state_data.duration/60)+' min';
            }
            if (state_data.duration>60*60){
                state_data.duration_text=(state_data.duration/60/60).toFixed(1)+' hour';
            }
            //Insert state record
            db.collection('states').insert(state_data);

            //update the last state record on the device
            var qry={ _id:device};
            db.collection('devices').update(qry,{$set:{state:state_data}},{upsert:true});

            //send state message on socket
            socket_send.send(device,'state',state_data);

            //generate an event
            msg_event={
                timestamp: state_data._id.timestamp,
                event_type:'state_change',
                event_data:{from: state_data.state, to: state_data.previous_state},
                event_description:'state changed from ' + state_data.previous_state_description + ' to ' + state_data.state_description + ' after ' + state_data.duration_text
            };
            var topic=util.device_topic(device)+'/event';
            console.log("Publishing event with topic: " + topic)
            mqtt_client.publish(topic,JSON.stringify(msg_event));

            callback(null,true);
        } else{
            console.log("No state change: " + device_string)
        }
    });
}
