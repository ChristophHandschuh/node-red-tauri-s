module.exports = function(RED) {
    "use strict";
    try {
        var i2c = require("i2c-bus");   
    } catch (error) {
        var i2c_error = error;
        i2c = null;
    }

    function validateI2C(node) {
        if (!i2c) {
            node.log("Couldn't load i2c-bus, try npm i i2c-bus");
            node.status({fill:"gray",shape:"dot",text:"unsupported"});
            if (i2c_error) console.error(i2c_error);
            return false;
        }
        return true;
    }

    function validateMSG(str) {
        try{
            const obj = JSON.parse(str);
            if(obj.hasOwnProperty("pin") && obj.hasOwnProperty("state")){
                return true;
            }
        }catch (error) {
            return false;
        }
        return false;
    }

    function binary_output(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        if (!validateI2C(node)) return;

        //init i2c module
        try{
            node.port = i2c.open(1, err => {if (err) throw err;});
            this.log(node.port);
        } catch(error){
            node.status({fill:"red",shape:"dot",text:"not connected to bus port"});
        }

        //**** input handler ****//
        node.on('input', function(msg) {
            if(msg.payload === "pinstates"){
                //TODO - I2C read
            }else if(msg.payload === "serialnumber"){
                if(config.serialnum === ""){
                    msg.payload = "command: serialnumber, but serialnumber is not specified";
                    this.send([null,null,msg]);
                }else{
                    msg.payload = {"serialnumber": config.serialnum,"modulname": config.modname,"modulnumber": config.modnum};
                    this.send([null,msg,null]);
                }
            }else if(validateMSG(msg.payload)){
                const obj = JSON.parse(msg.payload);
                
            }
        });

        //**** close handler ****//
        node.on("close", function() {
            node.port.closeSync();
        });
    }
    RED.nodes.registerType("Binary Output",binary_output);
}