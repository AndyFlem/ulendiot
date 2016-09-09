var u_dashboard=require('./dashboard.js');
var u_monitor=require('./monitor.js');
var u_state=require('./state.js');
var u_command=require('./command.js');
var u_event=require('./event.js');

var u_config=require('./config.js');
var u_sockets=require('./sockets.js');

//var MongoClient = require('mongodb').MongoClient;

//var mongo_url = 'mongodb://10.0.0.90:27017/ulendiot';
var mqtt_url='mqtt://10.0.0.90';
var port = 80;
var ip='10.0.0.90';

var express=require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);



var sockets={};

server.listen(port,ip, function () {
    console.log('Server listening at port %d', port);
});

//Static route
app.use(express.static(__dirname + '/../public'));

//Dashboard definition
app.get("/dashboard",function (req, res) {
    if (req.query.d){
        console.log("Dashboard request: " + req.query.d);
        u_dashboard.dashboard_get(req.query.d,function(err,dash_defn){
            if (err){
                console.log("Dashboard err: " + err);
                res.send('err');
            }else{
                console.log("Dashboard response sent:" + req.query.d);
                res.send(dash_defn);
            }
        });
    }
});

//Config request
app.get("/config",function (req, res) {
    if (req.query.device){
        console.log("Config request: " + req.query.device);
        u_config.config_get(req.query.device,function(err,config_defn){
            if (err){
                console.log("Config err: " + err);
                res.send('err');
            }else{
                console.log("Config response sent:" + req.query.device);
                res.send(config_defn);
            }
        });
    }
});

u_command.start(mqtt_url);
u_sockets.start(io,u_command.process_command);
u_monitor.start(mqtt_url,u_sockets);
u_state.start(mqtt_url,u_sockets);
u_event.start(mqtt_url,u_sockets);



