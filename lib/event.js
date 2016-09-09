var util=require('./utils.js');
var mqtt = require('mqtt');
var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://10.0.0.90:27017/ulendiot';
var db;
var mqtt_client;
var emailTimeout;

var socket_send;

module.exports = {
    start: function (mqtt_server,socket_sender) {
        console.log("Event handler starting.");
        socket_send=socket_sender;
        socket_send.register_connect_callback(send_on_connect);

        MongoClient.connect(url, function (err, db_con) {
            if (err) {
                console.log(err)
            }
            db = db_con;
        });
        mqtt_client = mqtt.connect(mqtt_server);

        mqtt_client.on('connect', function () {
            mqtt_client.subscribe('/+/+/+/event');
            mqtt_client.subscribe('/+/+/+/command');
        });

        mqtt_client.on('message', function (topic, message) {
            var msg;
            try{
                msg=JSON.parse(message.toString());
            } catch (err){
                console.log("Couldn't parse event message with topic:" + topic);
                msg=null;
            }
            if (msg){
                console.log('Event message topic: ' + topic);
                process_event(topic,msg, function(err,response){
                    if(err)
                    {
                        console.log(err);
                    }else {
                        console.log("Processed event message with topic:" + topic)
                    }
                });
            }
        });

    }
};

var process_event= function (event_topic,event_data, callback) {
    var device=util.device_from_topic(event_topic);
    var device_string=util.device_string(device);

    //Checks
    if(!device || !event_data.timestamp){
        callback(new Error("Event message: " + event_topic + " malformed."));
        return;
    }

    event_data._id={device: device, timestamp: new Date(event_data.timestamp)};
    delete event_data.timestamp;
    if(event_data.command){delete event_data.command};

    db.collection('events').insert(event_data, function (err, result) {
        if (err) {callback(err); return;}

        socket_send.send(device,'event',event_data);

        //Get last 10 events and emit their descriptions
        getEvents(function(events_msg){
            socket_send.send('system','events',events_msg);

            //set timeout (clear if already set) for email
            if(emailTimeout){clearTimeout(emailTimeout);}
            emailTimeout=setTimeout(function(){
                require('./email.js').send_mail('Ulendiot System Events',events_msg.text,function(){
                    console.log('Events email sent');
                });
            },15000);
        });
    });

    callback(null,true);
}

var send_on_connect=function(){
    console.log("Sending event data for clinet connect")
        getEvents(function(events_msg) {
            socket_send.send('system','events', events_msg);
        });
}

var getEvents=function(callback){
    db.collection('events').find().sort({'_id.timestamp':-1}).limit(5).toArray(function (err,events){
        var events_msg={};
        events_msg.text=''
        for (var j=0;j<events.length;j++){
            var device_str=util.device_name(events[j]._id.device);
            events_msg.text+="<p><b>" + events[j]._id.timestamp.toLocaleDateString() + " " + events[j]._id.timestamp.toLocaleTimeString() + ":</b> " + device_str + ", " + events[j].event_description + "</p>";
        }
        callback(events_msg);
    });
}