var nodemailer = require('nodemailer');

module.exports = {
    send_mail: function (subject,message,callback) {

        var smtpConfig = {
            host: 'mail.westernpower.org',
            port: 587,
            secure: false, // use SSL
            requireTLS:true,
            auth: {
                user: 'andyulendo',
                pass: 'Extramild20'
            }
        };

        var transporter = nodemailer.createTransport(smtpConfig);

        var mailOptions = {
            from: '"Ulendiot System" <andy@ulendo.com>', // sender address
            to: 'andy@ulendo.com', // list of receivers
            subject: subject, // Subject line
            text: message, // plaintext body
            html: message
        };
        transporter.sendMail(mailOptions, function(error, info){
            if(error){
                console.log("Emails not sent: " + error)
                callback(error,false);
            }else
            {
                console.log("Emails sent.")
                callback(null,true);
            }

        });
    }
}