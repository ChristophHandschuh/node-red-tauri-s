module.exports = function(RED) {
    "use strict";
    const pinMap = {0: [0x12, 0b10000000],
                    1: [0x12, 0b01000000],
                    2: [0x12, 0b00100000],
                    3: [0x12, 0b00010000],
                    4: [0x12, 0b00001000],
                    5: [0x12, 0b00000100],
                    6: [0x13, 0b00001000],
                    7: [0x13, 0b00000100],
                    8: [0x13, 0b00000010],
                    9: [0x13, 0b00000001],
                    10: [0x12, 0b00000001],
                    11: [0x12, 0b00000010]}

    var currentPinsA = 0b00000000;
    var currentPinsB = 0b00000000;

    try {
        var i2c = require("i2c-bus");   
    } catch (error) {
        var i2c_error = error;
        i2c = null;
    }

    function binary_output(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        var activeCMD = false;
        var busAddress = 0x20 + parseInt(config.modnum, 16);
        node.log(busAddress);

        /*** GLOBAL FUNCTIONS ***/
        function validateMSG(obj) {
            try{
                if(obj.hasOwnProperty("signalname") && obj.hasOwnProperty("state") && (obj["state"] === "HIGH" || obj["state"] === "LOW")){
                    return true;
                }
            }catch (error) {
                node.log(error);
                return false;
            }
            return false;
        }

        //set all pins on hardware
        function setPins(pins, state, cmd, signalName="", oldState=""){
            for(let i=0;i<pins.length;i++){
                const pinConf = pinMap[pins[i]];
                var futurePins = 0b00000000;

                if(state === "HIGH"){
                    if(pinConf[0] == 0x12){
                        futurePins = currentPinsA | pinConf[1];
                        currentPinsA = futurePins;
                    }else if(pinConf[0] == 0x13){
                        futurePins = currentPinsB | pinConf[1];
                        currentPinsB = futurePins;
                    }
                }else if(state === "LOW"){
                    if(pinConf[0] == 0x12){
                        futurePins = currentPinsA & ~pinConf[1];
                        currentPinsA = futurePins;
                    }else if(pinConf[0] == 0x13){
                        futurePins = currentPinsB & ~pinConf[1];
                        currentPinsB = futurePins;
                    }
                }
                
                var buffer = new Buffer.from([pinConf[0], futurePins]);
                node.port.i2cWriteSync(busAddress, 2, buffer, function(err) {if (err) {
                    node.status({fill:"red",shape:"dot",text:"i2c error"});
                    node.send([null,null,{"payload": {"timestamp": Date.now(), "info": "i2c error"+err, "modulname": config.modname,"modulnumber": config.modnum}}]);
                }});
            }
            //deactivate cmd
            if(cmd){
                node.send([null, {"payload": {"timestamp": Date.now(), "signalname": signalName, "state": oldState, "info": "", "modulname": config.modname,"modulnumber": config.modnum}}, null]);
                activeCMD = false;
            }
        }

        //check for i2c module
        if (!i2c) {
            node.log("Couldn't load i2c-bus, try npm i i2c-bus");
            node.status({fill:"gray",shape:"dot",text:"unsupported"});
            if (i2c_error){
                console.error(i2c_error);
            }
            node.send([null,null,{"payload": {"timestamp": Date.now(), "info": "Couldn't load i2c-bus, try npm i i2c-bus", "modulname": config.modname,"modulnumber": config.modnum}}]);
            return false;
        }

        /*** INIT I2C MODULE ***/
        try{
            node.port = i2c.openSync(parseInt(config.busnum), err => {if (err) throw err;});
        }catch(err){
            node.log(err);
        }
        
        try{
            var buffer = new Buffer.from([0x00, 0x00]);
            node.port.i2cWriteSync(busAddress, 2, buffer, function(err) {if (err) {throw err;}});
            buffer = new Buffer.from([0x01, 0x00]);
            node.port.i2cWriteSync(busAddress, 2, buffer, function(err) {if (err) {throw err;}});
            
            //read old pinstates
            currentPinsA = node.port.readWordSync(busAddress, 0x12);
            currentPinsB = node.port.readWordSync(busAddress, 0x13);

        } catch(err){
            node.status({fill:"red",shape:"dot",text:"not connected to bus number"});
            node.send([null,null,{"payload": {"timestamp": Date.now(), "info": "not connected to bus number", "modulname": config.modname,"modulnumber": config.modnum}}]);
        } finally {
            node.status({fill:"green",shape:"dot",text:"connected"});
        }

        //**** input handler ****//
        node.on('input', function(msg) {
            if(msg.payload === "pinstates"){
                var pinstates0x12;
                var pinstates0x13;
                var output = [];

                try{
                    pinstates0x12 = node.port.readWordSync(busAddress, 0x12);
                    pinstates0x13 = node.port.readWordSync(busAddress, 0x13);
                    
                    //go through all signals
                    for(let i=0;i<config.pinConfig.length; i++){
                        const pinConf = pinMap[config.pinConfig[i][1]];
                        var currentState = 0b00000000;

                        if(pinConf[0] == 0x12){
                            currentState = pinstates0x12 & pinConf[1];
                        }else if(pinConf[0] == 0x13){
                            currentState = pinstates0x13 & pinConf[1];
                        }
                        if(currentState != 0b00000000 && config.pinConfig[i][4] == "normal"){
                            output.push({"signalname": config.pinConfig[i][0], "state": "HIGH"});
                        }else if(config.pinConfig[i][4] == "normal"){
                            output.push({"signalname": config.pinConfig[i][0], "state": "LOW"});
                        }else if(config.pinConfig[i][4] == "inverted" && currentState != 0b00000000){
                            output.push({"signalname": config.pinConfig[i][0], "state": "LOW"});
                        }else{
                            output.push({"signalname": config.pinConfig[i][0], "state": "HIGH"});
                        }
                    }
                    msg.payload = output;
                    this.send([msg,null,null]);
            
                }catch(err){
                    node.error(err);
                    node.status({fill:"red",shape:"dot",text:"address not found. False bus number?"});
                }
            }else if(msg.payload === "serialnumber"){
                if(config.serialnum === ""){
                    msg.payload = {"timestamp": Date.now(), "info": "command: serialnumber, but serialnumber is not specified", "modulname": config.modname,"modulnumber": config.modnum};
                    this.send([null,null,msg]);
                }else{
                    msg.payload = {"timestamp": Date.now(), "serialnumber": config.serialnum,"modulname": config.modname,"modulnumber": config.modnum};
                    this.send([null,msg,null]);
                }
            }else if(validateMSG(msg.payload)){
                const signalName = msg.payload["signalname"];
                var oldState = msg.payload["state"];
                var state = oldState;
                var pins = [];
                var type = "";
                var duration = 0;
                var inverted = false;

                //check for type and load all pins
                for(let i=0;i<config.pinConfig.length; i++){
                    if(config.pinConfig[i][0] == signalName){
                        type = config.pinConfig[i][2];
                        duration = config.pinConfig[i][3];
                        pins.push(config.pinConfig[i][1]);
                        if(config.pinConfig[i][4] == "inverted" && !inverted){
                            state = (oldState=="HIGH") ? "LOW":"HIGH";
                            inverted = true;
                        }
                    }
                }
                
                if(type === "info"){
                    setPins(pins, state, false);
                    msg.payload = {"timestamp": Date.now(), "signalname": signalName, "state": oldState, "info": "", "modulname": config.modname,"modulnumber": config.modnum};
                    node.send([null, msg, null]);
                }else if(type === "cmd"){
                    if(activeCMD){
                        msg.payload = {"timestamp": Date.now(), "signalname": signalName, "state": oldState, "info": "cmd currently running", "modulname": config.modname,"modulnumber": config.modnum};
                        this.send([null,msg,null]);
                    }else{
                        msg.payload = {"timestamp": Date.now(), "signalname": signalName, "state": oldState, "info": "", "modulname": config.modname,"modulnumber": config.modnum};
                        node.send([null, msg, null]);
                        setPins(pins, state, false);
                        activeCMD = true;
                        state = (state=="HIGH") ? "LOW":"HIGH";
                        oldState = (oldState=="HIGH") ? "LOW":"HIGH";
                        setTimeout(function(){setPins(pins, state, true, oldState, signalName)}, duration*1000);
                    }
                }
            }else{
                /* Diagnose msg */
                const payload = msg.payload
                msg.payload = {"timestamp": Date.now(), "signalname": "", "state": "", "info": "Could not resole input: "+payload.toString(), "modulname": config.modname,"modulnumber": config.modnum};
                node.send([null, msg, null]);
            }
        });

        //**** close handler ****//
        node.on("close", function() {
            node.port.closeSync();
        });
    }
    RED.nodes.registerType("Binary Output",binary_output);
}
