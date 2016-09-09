freeboard.addStyle('.indicator-button',"float:left;margin-left:10px;margin-right:30px;margin-top:3px;background-image: -webkit-linear-gradient(top, rgba(148,146,148,1) 22%,rgba(69,69,69,1) 100%);background-image:-moz-linear-gradient(top, rgba(148,146,148,1) 22%,rgba(69,69,69,1) 100%);background-image:     -ms-linear-gradient(top, rgba(148,146,148,1) 22%,rgba(69,69,69,1) 100%);background-image:-o-linear-gradient(top, rgba(148,146,148,1) 22%,rgba(69,69,69,1) 100%);background-image: linear-gradient(top, rgba(148,146,148,1) 22%,rgba(69,69,69,1) 100%); -webkit-box-shadow: 1px 1px 2px 0px rgba(56,56,56,1);-moz-box-shadow: 1px 1px 2px 0px rgba(56,56,56,1);box-shadow: 1px 1px 2px 0px rgba(56,56,56,1);border: solid 1px rgba(0,0,0,1);-webkit-border-radius: 5px; -moz-border-radius: 5px; border-radius: 5px;width: 56px;height: 23px;padding: 3px;display: block;text-align: center;color: rgba(230,230,230,1);")
freeboard.addStyle('.indicator-button:hover',"border: dotted 1px rgba(0,0,0,1);color: rgba(196,196,196,1);")
freeboard.addStyle('.indicator-button:active',"background-image: -webkit-linear-gradient(top, rgba(156,156,156,1) 22%,rgba(115,115,115,1) 100%);background-image:-moz-linear-gradient(top, rgba(156,156,156,1) 22%,rgba(115,115,115,1) 100%);background-image: -ms-linear-gradient(top, rgba(156,156,156,1) 22%,rgba(115,115,115,1) 100%);background-image:-o-linear-gradient(top, rgba(156,156,156,1) 22%,rgba(115,115,115,1) 100%);background-image: linear-gradient(top, rgba(156,156,156,1) 22%,rgba(115,115,115,1) 100%);-webkit-box-shadow: 0px 0px 2px 0px rgba(0,0,0,1)inset;-moz-box-shadow: 0px 0px 2px 0px rgba(0,0,0,1)inset;box-shadow: 0px 0px 2px 0px rgba(0,0,0,1)inset;text-indent: -2px;color: rgba(194,194,194,1);");


var indicatorButtonWidget = function (settings) {
    var self = this;
    var titleElement = $('<h2 class="section-title"></h2>');
    var stateElement = $('<div class="indicator-text"></div>');
    var buttonElement = $('<div class="indicator-button"></div>');
    var indicatorElement = $('<div class="indicator-light"></div>');
    var currentSettings = settings;
    var isOn = false;
    var onText;
    var offText;
    var socket;
    var url;

    function initializeSocket() {
        // Reset connection to server
        discardSocket();
        self.url = currentSettings.url + '/' + currentSettings.namespace;
        console.info("Button connecting to Node.js at: %s", self.url);
        self.socket = io(self.url,{'forceNew':true});

        // Join the rooms
        self.socket.on('connect', function() {
            console.info("Button Connected to Node.js at: %s", self.url);
        });
    }

    function discardSocket() {
        // Disconnect datasource websocket
        if (self.socket) {
            self.socket.disconnect();
        }
    }

    function updateState() {
        indicatorElement.toggleClass("on", isOn);

        if (isOn) {
            stateElement.text((_.isUndefined(onText) ? (_.isUndefined(currentSettings.on_text) ? "" : currentSettings.on_text) : onText));
        }
        else {
            stateElement.text((_.isUndefined(offText) ? (_.isUndefined(currentSettings.off_text) ? "" : currentSettings.off_text) : offText));
        }
    }

    this.clicked=function() {
        console.log('Button. Sending event:' + currentSettings.event + ' with message: ' + currentSettings.message);
        self.socket.emit(currentSettings.event, currentSettings.message);
    }

    this.render = function (element) {
        $(buttonElement).click(this.clicked);
        $(element).append(titleElement).append(buttonElement).append(indicatorElement).append(stateElement);
    }

    this.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        titleElement.html((_.isUndefined(newSettings.title) ? "" : newSettings.title));
        buttonElement.html((_.isUndefined(newSettings.button_text) ? "" : newSettings.button_text));
        initializeSocket();
        updateState();
    }

    this.onCalculatedValueChanged = function (settingName, newValue) {
        if (settingName == "value") {
            isOn = Boolean(newValue);
        }
        if (settingName == "on_text") {
            onText = newValue;
        }
        if (settingName == "off_text") {
            offText = newValue;
        }

        updateState();
    }

    this.onDispose = function () {
    }

    this.getHeight = function () {
        return 1;
    }

    this.onSettingsChanged(settings);
};

freeboard.loadWidgetPlugin({
    type_name: "indicator_button",
    display_name: "Indicator Light Button",
    external_scripts : [ "https://cdn.socket.io/socket.io-1.4.5.js" ],
    settings: [
        {
            name: "title",
            display_name: "Title",
            type: "text"
        },
        {
            name: "button_text",
            display_name: "Button Text",
            type: "text"
        },
        {
            name: "value",
            display_name: "Value",
            type: "calculated"
        },
        {
            name: "on_text",
            display_name: "On Text",
            type: "calculated"
        },
        {
            name: "off_text",
            display_name: "Off Text",
            type: "calculated"
        },
        {
            name: "url",
            display_name: "Socket.IO Url",
            type: "text"
        },
        {
            name: "namespace",
            display_name: "Socket.IO Namespace",
            type: "text"
        },
        {
            name: "event",
            display_name: "Socket.IO Event",
            type: "text"
        },
        {
            name: "message",
            display_name: "On Click Message",
            type: "text"
        }


    ],
    newInstance: function (settings, newInstanceCallback) {
        newInstanceCallback(new indicatorButtonWidget(settings));
    }
});

