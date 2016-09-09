var util=require('./utils.js');
var io;

var connect_callbacks=[];

module.exports = {
    start: function (io_serv,command_handler) {
        console.log("Sockets handler starting.");
        u_command=command_handler;
        io=io_serv;
        io.on('connection', function(socket){
            console.log("Socket connection " + io.engine.clientsCount)

            for (var j=0;j<connect_callbacks.length;j++){
                connect_callbacks[j]();
            }

            socket.on('disconnect', function(){
                console.log("Socket disconnection " + io.engine.clientsCount)
            });
            socket.on('command',function(data){
                command_handler(data,function(err,result){
                    if(err){
                        console.log("Command processor reported error: " + err);
                    }
                });
            })
        });
    },

    register_connect_callback: function(callback){
        connect_callbacks.push(callback);
    },

    send:function (device,event,message,callback) {
        var device_string;
        var message_string;

        if(typeof device=='object'){
            device_string=util.device_string(device);
        }else
        {
            device_string=device;
        }
        if(typeof message=='object'){
            pld={};
            pld[device_string]=message;
            message_string=JSON.stringify(pld);
        }else
        {
            message_string=message;
        }
        io.emit(event,message_string);

        if(callback){callback(null,true);}
    }


}

