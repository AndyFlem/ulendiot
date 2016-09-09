var textBoxWidget = function (settings) {
    var self = this;
    var titleElement = $('<h2 class="section-title"></h2>');
    var textElement = $('<div class="tw-value" style="font-size: 12px; overflow: scroll; height:150px; width:280px; white-space:normal;"></div>');

    var currentSettings = settings;

    this.render = function (element) {
        $(element).append(titleElement).append(textElement);
    }

    this.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        titleElement.html((_.isUndefined(newSettings.title) ? "" : newSettings.title));
    }

    this.onCalculatedValueChanged = function (settingName, newValue) {
        textElement.html(newValue);
    }

    this.onDispose = function () {
    }

    this.getHeight = function () {
        return 3;
    }

    this.onSettingsChanged(settings);
};

freeboard.loadWidgetPlugin({
    type_name: "text_box",
    display_name: "Text Box",
    settings: [
        {
            name: "title",
            display_name: "Title",
            type: "text"
        },
        {
            name: "value",
            display_name: "Value",
            type: "calculated"
        }
    ],
    newInstance: function (settings, newInstanceCallback) {
        newInstanceCallback(new textBoxWidget(settings));
    }
});

