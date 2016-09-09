var util=require('./utils.js');
var mqtt = require('mqtt');
var mqtt_client;

module.exports = {
    start: function (mqtt_server) {
        console.log("Command handler starting.");
        mqtt_client = mqtt.connect(mqtt_server);
    },

    process_command: function (data,callback){
        var cmd;
        try{
            cmd=JSON.parse(data);
        } catch (err){
            callback(new Error("Couldn't parse command message:" + data));
            return;
        }

        console.log('Received command: ' + data);

        if(!cmd.device || !cmd.command){
            callback(new Error("Command message malformed: " + data));
            return;
        }

        var device=util.device_from_string(cmd.device);
        var topic=util.device_topic(device)+'/command';
        console.log('Publishing command: ' + cmd.command + ' to ' + topic);
        cmd.timestamp=new Date();
        cmd.event_description='command ' + cmd.command + ' received';
        cmd.event_type='command';
        cmd.event_data=cmd.command;
        //cmd.send_email=false;
        mqtt_client.publish(topic,JSON.stringify(cmd));
        callback(null,true);
    }
};
