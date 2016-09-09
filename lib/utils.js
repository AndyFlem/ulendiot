module.exports = {

    device_from_topic: function (device_topic) {
        var ids = device_topic.split('/');
        if (ids.length < 5) {
            return false;
        } else {
            return {'location': ids[1], 'type': ids[2], 'no': parseInt(ids[3])};
        }

    },

    device_from_string: function (device_string) {
        var ids = device_string.split('_');
        if (ids.length < 3) {
            return false;
        } else {
            return {'location': ids[0], 'type': ids[1], 'no': parseInt(ids[2])};
        }

    },

    device_string: function (device) {
        return device.location + "_" + device.type + "_" + device.no;
    },

    device_topic: function (device) {
        return "/" + device.location + "/" + device.type + "/" + device.no;
    },

    device_name: function (device) {
        return device.type + ' no.' + device.no + ' at ' + device.location;
    }
}
