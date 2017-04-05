var touches = [];
var first_touch;

var version = "0.0.1";


var db;
var bt = false; 
var deviceList = [];

//Own Defice info
var devInfo = [];
var serverInfo = { uuid:"6ccefb4c-4e37-4c79-934a-793dc2533de2", socketID: null};
var connections =[];
var socketToDevice = [];

var settings = [];

var test_mode = false;
var bt_test_mode = false;


/*
	Required to bootstrap to the cordova engine.
	Contains all event handlers for the engine as well as first initalization.
*/
var app = {

	initialize: function() {
		this.bindEvents();
	},

  	bindEvents: function() {
   		document.addEventListener('DeviceReady', this.onDeviceReady, false);
    	document.addEventListener('backbutton', this.onBackKeyDown, false);
		document.addEventListener('Pause', this.onPause, false);
		document.addEventListener('Resume', this.onResume, false);
 	},

 	//this is where everything starts
  	onDeviceReady: function() {
		uiControl.startDebugger();
		dataManager.initialize();		
		npms.initialize();
	},

	onBackKeyDown: function() {
		if(onBackKeyDown.length > 0){
			uiControl.updateDebugger("cb", onBackKeyDown[onBackKeyDown.length-1]);
			onBackKeyDown[onBackKeyDown.length]();
		}
	},

	onPause:function() {
	},

	onResume:function() {
	}
};

/*
	manages the database and other basic data functions
*/
var dataManager = {

  	initialize:function() {
  		if (test_mode){
			test.db_initialize();
  		} else {
    		db = window.openDatabase("pup", version, "dmgr", 20000);
    		db.transaction(function(tx){
    			dataManager.declareTables(tx);
    		}, dataManager.errorCB);
  		}
    	dataManager.loadAppSettings();
    	dataManager.loadDeviceList();
  	},

	declareTables:function (tx) {
		tx.executeSql('CREATE TABLE IF NOT EXISTS device (uid Primary Key, address, last_connected, name, muted, blocked)');
		tx.executeSql('CREATE TABLE IF NOT EXISTS messages (mid Primary Key, sender, receiver, timestamp, content)');
		tx.executeSql('CREATE TABLE IF NOT EXISTS app_settings (uid Primary Key, onLoadDiscovery, makeDiscoverable)');
	},

	clearAllData:function() {
		db.transaction(function(tx){
			uiControl.updateDebugger("DM", "Data Cleared");
			tx.executeSql('DROP TABLE IF EXISTS device');
			tx.executeSql('DROP TABLE IF EXISTS messages');
			tx.executeSql('DROP TABLE IF EXISTS app_settings');
			dataManager.declareTables(tx);
    	}, dataManager.errorCB);	
	},

  	//loads all devices we have in database
  	loadDeviceList:function() {
  		db.transaction(function(tx) {
			tx.executeSql('SELECT * FROM device ORDER BY last_connected DESC', [], function(tx, results) {
				var offline_list = document.getElementById("offline_deviceList");
				for (var i = 0; i < results.rows.length; i++) {
					device = results.rows.item(i);
					uiControl.deviceListPopulate(device);
				}
			}, dataManager.errorCB);
		}, dataManager.errorCB);
  	},

  	//takes the device object passed and adds it or updates its database entry
  	updateDevice:function(device) {
  		db.transaction(function(tx) {
  			tx.executeSql('SELECT uid FROM device where uid=?', [device.uid], function(tx, results) {
	  			if(results.rows.length > 0 ){
					tx.executeSql('Update device SET last_connected = ?, name = ? WHERE uid = ?', [Date.now(), device.name, device.uid]);
	  			} else {
					tx.executeSql('INSERT INTO device(uid, address, last_connected, name, muted, blocked) VALUES ( ?, ?, ?, ?, ?, ?)', [device.uid , device.address, Date.now(), device.name, false, false]);
	  			}
			}, dataManager.errorCB);
		}, dataManager.errorCB);
  	},

  	updateDeviceSettings:function(device) {
  		db.transaction(function(tx) {
				tx.executeSql('Update device SET blocked = ?, muted = ? WHERE uid = ?', [device.blocked, device.muted, device.uid]);
		}, dataManager.errorCB);
  	},

  	//loads messages from db, based on device MAC address
  	loadMessages:function(device) {
  		if(device.uid){
	  		db.transaction(function(tx){
				tx.executeSql('SELECT * FROM messages where sender = ? or receiver = ? or reciever = ? ORDER BY timestamp ASC', [device.uid, device.uid, device.address], function(tx, results) {
					for (var i = 0; i < results.rows.length; i++) {
						message = results.rows.item(i);	
						messenger.addMessage(message);		
					}		
				}, dataManager.errorCB);
			}, dataManager.errorCB);  	
  		}
 	},

  	addMessage:function(message) {
  		db.transaction(function(tx) {
			tx.executeSql('INSERT INTO messages(mid, sender, receiver, timestamp, content) values (?, ?, ?, ?, ?)', [dataManager.generateID(), message.sender, message.receiver, Date.now(), message.content]);
		}, dataManager.errorCB);	
  	},

 	loadAppSettings:function() {
  		db.transaction(function(tx){
			tx.executeSql('SELECT * FROM app_settings', [], function(tx, results) {
				if(results.rows.length > 0){
					settings = results.rows.item(0);
					devInfo["uid"] = settings.uid;
				} else {
					devInfo["uid"] = dataManager.generateID();
					tx.executeSql('INSERT INTO app_settings(uid, onLoadDiscovery, makeDiscoverable) VALUES ( ?, ?, ?)', [devInfo.uid, false, true]);
					settings = {"uid":devInfo.uid,"onLoadDiscovery": false, "makeDiscoverable": true};
				}
				uiControl.setAppSettings();				
			}, dataManager.errorCB);
		}, dataManager.errorCB);  	
 	},

 	updateAppSettings:function(device) {
  		db.transaction(function(tx) {
			tx.executeSql('UPDATE app_settings SET onLoadDiscovery = ?, makeDiscoverable = ? WHERE uid = ?', [settings.onLoadDiscovery, settings.makeDiscoverable, settings.uid]);
		}, dataManager.errorCB);
  	},

 	//generates a random 10 character long base64 ide
  	generateID:function(){
  		var id = "";
    	var charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    	for( var i=0; i < 25; i++ )
     	   id += charSet.charAt(Math.floor(Math.random() * charSet.length));
   		return id;
 	},

 	errorCB:function(err) {
    	uiControl.updateDebugger("SQL ERROR", err.message, 10);
 	}

};

/*
	for all ui elements needing manipulation
	debugging information and animation functions
*/
var uiControl = {

	metrics: [],
	timeouts:[],

	//initalizes debugger and places the version number
	startDebugger:function(){
		var debug = document.getElementById("debug");
		debug.appendChild(uiControl.createDebugItem("Pre Alpha - " + version));
	},

	//updates the debug elements so values can be seen during runtime
	updateDebugger:function(id, val, timeout){
		if(uiControl.metrics[id]){
			element = uiControl.metrics[id];
			element.innerHTML = "";
			element.appendChild(uiControl.createDebugItem(id + " | " + val));
		} else {
			var debug = document.getElementById("debug");
			newMetric = uiControl.createDebugItem(id + " | " + val);
			uiControl.metrics[id] = newMetric;
			debug.appendChild(newMetric);
		}
		if(timeout){
			if(uiControl.timeouts[id]){
				clearTimeout(uiControl.timeouts[id]);
			}
			uiControl.timeouts[id] = setTimeout(function() {
				uiControl.metrics[id].remove();
				clearTimeout(uiControl.timeouts[id]);
			}, timeout*1000);
		}
	},

	//Makes a debug  dom element
	createDebugItem:function(info){
		newMetric = document.createElement("DIV");
		newMetric.appendChild(document.createTextNode(info));
		return newMetric;
	},

	//creates and returns a dom element for a device
	createDeviceElement:function(device) {
		var device_container = document.createElement("DIV");
		
		device_container.className = "device";
		device_container.onclick = function() {
			var ocDevice = device;
			if( ocDevice.paired || ocDevice.last_connected){		
				messenger.initialize(ocDevice);	
			} else {
				npms.pair(ocDevice);
			}
		};

		devstatus = document.createElement("DIV");
		if(device.uuids){
			devstatus.className = "device_status online";
		} else {
			devstatus.className = "device_status";
		}
		device_container.appendChild(devstatus);
				
		devname = document.createElement("P");
		devname.className = "device_name";
		tempNode = document.createTextNode(device.name);
		devname.appendChild(tempNode);
		

		devaddr = document.createElement("P");
		devaddr.className = "device_address";
		tempNode = document.createTextNode(device.address);
		devaddr.appendChild(tempNode);
		
		devinfo = document.createElement("P");
		devinfo.className = "device_info";
		devinfo.id = "device_status_"+device.address;
		if(device.paired){
			tempNode = document.createTextNode("Paired");
			devinfo.appendChild(tempNode);
		} else if (device.last_connected) {
			var timeinfo = new Date(device.last_connected);
			tempNode = document.createTextNode("Last Connected " + timeinfo.toLocaleString());
			devinfo.appendChild(tempNode);		
		}

		device_container.appendChild(devname);
		device_container.appendChild(devaddr);
		device_container.appendChild(devinfo);

		return device_container;
	},

	//create and returns a dom element for a message
	createMessageElement:function(message) {
		message_container = document.createElement("DIV");
		message_content = document.createElement("P");
		message_timestamp = document.createElement("SPAN");
		if(message.receiver == devInfo.uid){
			message_container.className = "message_container left";
			message_content.className = "message receiver";	
			message_timestamp.className = "message_timestamp receiver";
		} else {
			message_container.className = "message_container right";
			message_content.className = "message sender right";
			message_timestamp.className = "message_timestamp right";
		}
		var timeinfo = new Date(message.timestamp);

		tempNode = document.createTextNode(timeinfo.toLocaleString());
		message_timestamp.appendChild(tempNode);

		tempNode = document.createTextNode(message.content);
		message_content.appendChild(tempNode);

		message_content.appendChild(document.createElement("br"));
		message_content.appendChild(message_timestamp);
		message_container.appendChild(message_content);
		return message_container;
	},

	/*
	Handles device discovery
	Gets passed a device and adds it to the UI
	*/
	deviceListPopulate:function(device) {
		var list = null;
		if(device.name != undefined){
			//selects the list to put it in
			if(device.paired){
				list = document.getElementById("paired_deviceList")
			} else if(device.last_connected){
				list = document.getElementById("offline_deviceList");
			} else {
				list = document.getElementById("unpaired_deviceList")
			}

			//if it has already been added it may need to be moved between lists
			if (deviceList[device.address] != undefined) {
				saved_device = deviceList[device.address];
				saved_device.element.parentNode.removeChild(saved_device.element);
				saved_device.name = device.name;
				saved_device[uuids] = device.uuids;
				list.appendChild(uiControl.createDeviceElement(saved_device));
			} else {
				device
				deviceList[device.address] = device;
				list.appendChild(uiControl.createDeviceElement(device));
			}
		}
	},

	setAppSettings:function() {
		document.getElementById("setting_onLoadDiscovery").checked = (settings.onLoadDiscovery == "true" || settings.onLoadDiscovery == true);
		document.getElementById("setting_makeDiscoverable").checked = (settings.makeDiscoverable == "true" || settings.makeDiscoverable == true);
	},

	setDeviceSettings:function(device) {
		document.getElementById("setting_mute").checked = (device.muted == "true" || device.muted == true);
		document.getElementById("setting_block").checked = (device.blocked == "true" || device.blocked == true);
	},

    toBeImplemented:function(arg) {
      alert('This feature is comming soon.');
    }

};

/*
	contains all methods pertaining to the bluetooth element of the app
	general functionality and data population
*/
var npms = {

	//gets general information and sets up general info updater
	initialize:function() {
        if(networking.bluetooth){
	        bt = networking.bluetooth;
	 	    bt.getAdapterState(npms.adapterHandler);
	 	    bt.onAdapterStateChanged.addListener(npms.adapterHandler);
	 	    npms.setupServices();
        }
	},

	//binds all the listening services for the npms
	setupServices:function() {
		bt.listenUsingRfcomm(serverInfo.uuid, function (serverSocketId) {
			serverInfo.socketID = serverSocketId;
		}, npms.errorHandler);
	 	bt.onDeviceAdded.addListener(uiControl.deviceListPopulate);
		bt.onAccept.addListener(npms.connectionEventHandler);
		bt.onReceive.addListener(npms.messageHandler);
		bt.onReceiveError.addListener(npms.serviceErrorHandler);
	},

	//handles all bluetooth server connections
	//TODO
	connectionEventHandler:function(acceptInfo) {
		//uiControl.updateDebugger("ACIo", Object.keys(acceptInfo));	
	},

	//handles all disconnect events and errors the server encounters
	//TODO
	serviceErrorHandler:function(errorInfo) {
		//uiControl.updateDebugger("Server Info", Object.keys(errorInfo));	
		//uiControl.updateDebugger("Server Info", errorInfo.errorMessage);

	},

	//handles the device information updates
	adapterHandler:function(adapterInfo) {
        devInfo.discoverable = adapterInfo.discoverable;
        devInfo.discovering = adapterInfo.discovering;
        devInfo.enabled = adapterInfo.enabled;
        devInfo.name = adapterInfo.name;

		if(devInfo.enabled){
	        uiControl.updateDebugger("Device BTE", devInfo.enabled);
	       	uiControl.updateDebugger("Device Discovering", devInfo.discovering);
	       	uiControl.updateDebugger("Device Discoverable", devInfo.discoverable);
		} else {
			bt.requestEnable(npms.getDevices, function () {
 	   			 bt.getAdapterState(npms.adapterHandler);
			});
		}
    },

    /*
	Handles message recieved events
	Current Status: Error reading information
	*/
	messageHandler:function(messageInfo) {
		//unwrap data
		messageInfo = messageInfo.data;
		packet = JSON.parse(messageInfo.data);

		uiControl.updateDebugger("Message recieved", packet.signature);
		//update device information
		device = deviceList[messageInfo.address];
		if(device){
			device["uid"] = packet.signature;
			dataManager.updateDevice(device);
		}

		//parse and update message information
		message = packet.data;
		message["timestamp"] = Date.now();
		message.receiver = devInfo.uid;
		dataManager.addMessage(message);
		//check if needed to display message
		if(messenger.device.address == messageInfo.address){
			messenger.addMessage(message);
		}
	},

	/*
	Sends messages to nearby servers
	Current Status: sending information
	*/
    send:function(device, message) {

		//connects to the other device
		//send then close and restart the listening service
		packet = {"signature": devInfo.uid, "data":message};
		sendable = JSON.stringify(packet);
		bt.connect(device.address, serverInfo.uuid, function(socketID) {
			bt.send(socketID, sendable, function(bytes_sent) {
				dataManager.addMessage(message);
		   		bt.close(socketID);
			}, npms.errorHandler);
		}, npms.errorHandler);
    },

    pair:function(device) {
    	devStatus = document.getElementById("device_status_"+device.address);
		bt.connect(device.address, serverInfo.uuid, function(socketID) {
	   		devStatus.removeChild(devStatus.firstChild);
			devStatus.appendChild(document.createTextNode("Paired"));
			device.paired = true;

		}, function(error) {
			devStatus.removeChild(devStatus.firstChild);
			devStatus.appendChild(document.createTextNode("Pairing Failed"));
		});
		while (devStatus.firstChild) {
	    	devStatus.removeChild(devStatus.firstChild);
		}
		devStatus.appendChild(document.createTextNode("Pairing...")); 
    },

	/*
	Starts Device discovery
	Sets a 30 Second discovery timeout
	Will timeout after no more devices are detected anyway
	Also will request to make the current device discoverable
	*/
	discoTimeout:null,
	refreshList:function() {
	    if(npms.discoTimeout == null){
			bt.startDiscovery(function () {
	       		document.getElementById("loading_spinner").className = "loading_spinner icon";
	       		document.getElementById("loadingInfo").style.display = "block";
	       		if(devInfo.discoverable == false && settings.makeDiscoverable){
	       			bt.requestDiscoverable(function () {}, function () {}); 
	       		}
	   		 	npms.discoTimeout = setTimeout(function () {
	        		bt.stopDiscovery();
	       			document.getElementById("loadingInfo").style.display = "none";
		       		document.getElementById("loading_spinner").className = "icon";
		       		clearTimeout(npms.discoTimeout);
		       		npms.discoTimeout = null;
	  			}, 15000);
			});
	   		 	
	    } else {
			bt.stopDiscovery();
	       	document.getElementById("loadingInfo").style.display = "none";
		    document.getElementById("loading_spinner").className = "icon";
		    clearTimeout(npms.discoTimeout);
		    npms.discoTimeout = null;
	    }
	},

	errorHandler:function(msg) {
        uiControl.updateDebugger("BT ERROR", msg);
	}
};


/*
	Contains all messages having to do with the 
	functionality of the messaging page
*/
var messenger = {

	device: null,

	initialize:function(device) {
		var header = document.getElementById("convo_partner");
		header.innerHTML = "";
		header.appendChild(document.createTextNode(device.name));
		document.getElementById("connections").style.display = "none";
		document.getElementById("messenger").style.display = "block";

		//initalizing actual items
		dataManager.loadMessages(device);	
		uiControl.setDeviceSettings(device);
		messenger.device = device;
	},

	//Places a message uiElement in the container, at the bottom of the conversation
	addMessage:function(message) {
		var container = document.getElementById("conversation_container");
		container.appendChild(uiControl.createMessageElement(message));			
        container.scrollTop = container.scrollHeight;
	},

	/*
	Gets input in the text area, wraps it in a message class and jsons it for sending.	
	*/
	processMessage:function() {
		userInput = document.getElementById("messenger_input").value;
		document.getElementById("messenger_input").value = "";
		message = {"sender": devInfo.uid, "reciever": messenger.device.address, "content": userInput};
		npms.send(messenger.device, message);
		
		message["timestamp"] = Date.now()
		messenger.addMessage(message);
	},

	back:function() {
		document.getElementById("connections").style.display = "block";
		document.getElementById("messenger").style.display = "none";
		//remove all messages so the page is ready to be repopulated
		var messages = document.getElementById("conversation_container");
		while (messages.firstChild) {
    		messages.removeChild(messages.firstChild);
		}
		deviceList[messenger.device.address] = messenger.device;
		messenger.device = null;
	}
};


var settingsHandler = {

 	loadAppSettings:function() {
 		document.getElementById("connections").style.display = "none";
		document.getElementById("app_settings").style.display = "block";
	},

	submitAppSettings:function() {
 		document.getElementById("connections").style.display = "block";
		document.getElementById("app_settings").style.display = "none";
		settings.onLoadDiscovery = document.getElementById("setting_onLoadDiscovery").checked;
		settings.makeDiscoverable = document.getElementById("setting_makeDiscoverable").checked;
		dataManager.updateAppSettings();
	},
	
	loadDeviceSettings:function() {
		document.getElementById("messenger").style.display = "none";
		document.getElementById("device_settings").style.display = "block";
	},

	submitDeviceSettings:function() {
		document.getElementById("messenger").style.display = "block";
		document.getElementById("device_settings").style.display = "none";
		messenger.device.muted = document.getElementById("setting_mute").checked;
		messenger.device.blocked = document.getElementById("setting_block").checked;
		dataManager.updateDeviceSettings(messenger.device);
	}

};
/*
	used to populate test data to make sure everything is coture
*/
var test = {

	//device list test data (used for when no devices are in range)
	getDeviceList: function() {
		var devices =[];
		device = {name: "Kurtis Galexy" , address: "FF:FF:FF:FF:FF:FF", rssi: "-20"};
		devices.push(device);
		device = {name: "Some Random Person 0" , address: "FF:FF:FF:FF:FF:FC", rssi: "-40"};
		devices.push(device);
		return devices;
	},


	//getting the general database structure and data setup
	db_initialize:function() {
    	db = window.openDatabase("test_pup", version, "dmgr", 20000);
    	db.transaction(function(tx){
			puid = dataManager.generateID();
			var test_convo_uid = [];

			//generates random userid's
			for (var i = 0; i < 7; i++) {
				test_convo_uid[i] = dataManager.generateID();
			}

			var device_table = "device(uid, address, last_connected, name, muted, blocked)";
			var message_table = "messages(mid, sender, receiver, timestamp, content)";

			//table data reset
			tx.executeSql('DROP TABLE IF EXISTS device');
			tx.executeSql('DROP TABLE IF EXISTS messages');
			tx.executeSql('DROP TABLE IF EXISTS app_settings');
			
			//re-declare tables
			dataManager.declareTables(tx);

			tx.executeSql('INSERT INTO app_settings(uid, onLoadDiscovery, makeDiscoverable) VALUES ( ?, ?, ?)', [puid, false, true]);

			//inserting device data
			//tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?)', [puid, "self", test.generateTimeStamp(), "John"]);
			tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?, ?, ?)', [test_convo_uid[0], "FF:FF:FF:FF:FF:FC", test.generateTimeStamp(), "Some Random Person With A Really Long Name", true, false]);
			tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?, ?, ?)', [test_convo_uid[1], "FF:FF:FF:FF:FF:FF", test.generateTimeStamp(), "Some Random Person With A Really Long Name", true, false]);
			for (var i = 2; i < test_convo_uid.length; i++) {
				tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?, ?, ?)', [test_convo_uid[i], test.generateFakeMac(), test.generateTimeStamp(),("Some Random Person "+i), false ,false]);
			}

			//Test convorsations 100 test messages - each
			for (var i = 0; i < test_convo_uid.length; i++) {
				for (var ii = 0; ii < 50; ii++) {
					tx.executeSql('INSERT INTO '+ message_table +' VALUES (?, ?, ?, ?, ?)', [dataManager.generateID(), test_convo_uid[i], puid, test.generateTimeStamp(), test.getRandomNaughtyString()]);
					tx.executeSql('INSERT INTO '+ message_table +' VALUES (?, ?, ?, ?, ?)', [dataManager.generateID(), puid, test_convo_uid[i], test.generateTimeStamp(), test.getRandomNaughtyString()]);
				}
			}
			//tx.executeSql('DELETE FROM user WHERE uid = 1');
		}, dataManager.errorCB);

	},

	generateTimeStamp:function() {
		var basetime = 1489659947000;
		return basetime + Math.floor(Math.random() * 500000000);
	},

	generateFakeMac:function() {
		var mac = "";
    	var charSet = "0123456789ABCDEF";
    	for( var i=0; i < 6; i++ ){
     	   mac += charSet.charAt(Math.floor(Math.random() * charSet.length));
     	   mac += charSet.charAt(Math.floor(Math.random() * charSet.length));
     	   mac += ":";
    	}
   		return mac.slice(0,-1);
	},

	getRandomNaughtyString:function() {
		var script_naughty = ["<script>alert(123)</script>", "&lt;script&gt;alert(&#39;123&#39;);&lt;/script&gt;", "<img src=x onerror=alert(123) />", "<svg><script>123<1>alert(123)</script>", "\"><script>alert(123)</script>", "'><script>alert(123)</script>", "><script>alert(123)</script>", "</script><script>alert(123)</script>", "< / script >< script >alert(123)< / script >", " onfocus=JaVaSCript:alert(123) autofocus", "\" onfocus=JaVaSCript:alert(123) autofocus", "' onfocus=JaVaSCript:alert(123) autofocus", "＜script＞alert(123)＜/script＞", "<sc<script>ript>alert(123)</sc</script>ript>", "--><script>alert(123)</script>", "\";alert(123);t=\"", "';alert(123);t='", "JavaSCript:alert(123)", ";alert(123);", "src=JaVaSCript:prompt(132)", "\"><script>alert(123);</script x=\"", "'><script>alert(123);</script x='", "><script>alert(123);</script x=", "\" autofocus onkeyup=\"javascript:alert(123)", "' autofocus onkeyup='javascript:alert(123)", "<script\\x20type=\"text/javascript\">javascript:alert(1);</script>", "<script\\x3Etype=\"text/javascript\">javascript:alert(1);</script>", "<script\\x0Dtype=\"text/javascript\">javascript:alert(1);</script>", "<script\\x09type=\"text/javascript\">javascript:alert(1);</script>", "<script\\x0Ctype=\"text/javascript\">javascript:alert(1);</script>", "<script\\x2Ftype=\"text/javascript\">javascript:alert(1);</script>", "<script\\x0Atype=\"text/javascript\">javascript:alert(1);</script>", "'`\"><\\x3Cscript>javascript:alert(1)</script>", "'`\"><\\x00script>javascript:alert(1)</script>", "ABC<div style=\"x\\x3Aexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:expression\\x5C(javascript:alert(1)\">DEF", "ABC<div style=\"x:expression\\x00(javascript:alert(1)\">DEF", "ABC<div style=\"x:exp\\x00ression(javascript:alert(1)\">DEF", "ABC<div style=\"x:exp\\x5Cression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\x0Aexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\x09expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE3\\x80\\x80expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x84expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xC2\\xA0expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x80expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x8Aexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\x0Dexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\x0Cexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x87expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xEF\\xBB\\xBFexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\x20expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x88expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\x00expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x8Bexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x86expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x85expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x82expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\x0Bexpression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x81expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x83expression(javascript:alert(1)\">DEF", "ABC<div style=\"x:\\xE2\\x80\\x89expression(javascript:alert(1)\">DEF", "<a href=\"\\x0Bjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x0Fjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xC2\\xA0javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x05javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE1\\xA0\\x8Ejavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x18javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x11javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x88javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x89javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x80javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x17javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x03javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x0Ejavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x1Ajavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x00javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x10javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x82javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x20javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x13javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x09javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x8Ajavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x14javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x19javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\xAFjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x1Fjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x81javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x1Djavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x87javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x07javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE1\\x9A\\x80javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x83javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x04javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x01javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x08javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x84javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x86javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE3\\x80\\x80javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x12javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x0Djavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x0Ajavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x0Cjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x15javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\xA8javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x16javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x02javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x1Bjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x06javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\xA9javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x80\\x85javascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x1Ejavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\xE2\\x81\\x9Fjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"\\x1Cjavascript:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"javascript\\x00:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"javascript\\x3A:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"javascript\\x09:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"javascript\\x0D:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "<a href=\"javascript\\x0A:javascript:alert(1)\" id=\"fuzzelement1\">test</a>", "`\"'><img src=xxx:x \\x0Aonerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x22onerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x0Bonerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x0Donerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x2Fonerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x09onerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x0Conerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x00onerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x27onerror=javascript:alert(1)>", "`\"'><img src=xxx:x \\x20onerror=javascript:alert(1)>", "\"`'><script>\\x3Bjavascript:alert(1)</script>", "\"`'><script>\\x0Djavascript:alert(1)</script>", "\"`'><script>\\xEF\\xBB\\xBFjavascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x81javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x84javascript:alert(1)</script>", "\"`'><script>\\xE3\\x80\\x80javascript:alert(1)</script>", "\"`'><script>\\x09javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x89javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x85javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x88javascript:alert(1)</script>", "\"`'><script>\\x00javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\xA8javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x8Ajavascript:alert(1)</script>", "\"`'><script>\\xE1\\x9A\\x80javascript:alert(1)</script>", "\"`'><script>\\x0Cjavascript:alert(1)</script>", "\"`'><script>\\x2Bjavascript:alert(1)</script>", "\"`'><script>\\xF0\\x90\\x96\\x9Ajavascript:alert(1)</script>", "\"`'><script>-javascript:alert(1)</script>", "\"`'><script>\\x0Ajavascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\xAFjavascript:alert(1)</script>", "\"`'><script>\\x7Ejavascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x87javascript:alert(1)</script>", "\"`'><script>\\xE2\\x81\\x9Fjavascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\xA9javascript:alert(1)</script>", "\"`'><script>\\xC2\\x85javascript:alert(1)</script>", "\"`'><script>\\xEF\\xBF\\xAEjavascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x83javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x8Bjavascript:alert(1)</script>", "\"`'><script>\\xEF\\xBF\\xBEjavascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x80javascript:alert(1)</script>", "\"`'><script>\\x21javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x82javascript:alert(1)</script>", "\"`'><script>\\xE2\\x80\\x86javascript:alert(1)</script>", "\"`'><script>\\xE1\\xA0\\x8Ejavascript:alert(1)</script>", "\"`'><script>\\x0Bjavascript:alert(1)</script>", "\"`'><script>\\x20javascript:alert(1)</script>", "\"`'><script>\\xC2\\xA0javascript:alert(1)</script>", "<img \\x00src=x onerror=\"alert(1)\">", "<img \\x47src=x onerror=\"javascript:alert(1)\">", "<img \\x11src=x onerror=\"javascript:alert(1)\">", "<img \\x12src=x onerror=\"javascript:alert(1)\">", "<img\\x47src=x onerror=\"javascript:alert(1)\">", "<img\\x10src=x onerror=\"javascript:alert(1)\">", "<img\\x13src=x onerror=\"javascript:alert(1)\">", "<img\\x32src=x onerror=\"javascript:alert(1)\">", "<img\\x47src=x onerror=\"javascript:alert(1)\">", "<img\\x11src=x onerror=\"javascript:alert(1)\">", "<img \\x47src=x onerror=\"javascript:alert(1)\">", "<img \\x34src=x onerror=\"javascript:alert(1)\">", "<img \\x39src=x onerror=\"javascript:alert(1)\">", "<img \\x00src=x onerror=\"javascript:alert(1)\">", "<img src\\x09=x onerror=\"javascript:alert(1)\">", "<img src\\x10=x onerror=\"javascript:alert(1)\">", "<img src\\x13=x onerror=\"javascript:alert(1)\">", "<img src\\x32=x onerror=\"javascript:alert(1)\">", "<img src\\x12=x onerror=\"javascript:alert(1)\">", "<img src\\x11=x onerror=\"javascript:alert(1)\">", "<img src\\x00=x onerror=\"javascript:alert(1)\">", "<img src\\x47=x onerror=\"javascript:alert(1)\">", "<img src=x\\x09onerror=\"javascript:alert(1)\">", "<img src=x\\x10onerror=\"javascript:alert(1)\">", "<img src=x\\x11onerror=\"javascript:alert(1)\">", "<img src=x\\x12onerror=\"javascript:alert(1)\">", "<img src=x\\x13onerror=\"javascript:alert(1)\">", "<img[a][b][c]src[d]=x[e]onerror=[f]\"alert(1)\">", "<img src=x onerror=\\x09\"javascript:alert(1)\">", "<img src=x onerror=\\x10\"javascript:alert(1)\">", "<img src=x onerror=\\x11\"javascript:alert(1)\">", "<img src=x onerror=\\x12\"javascript:alert(1)\">", "<img src=x onerror=\\x32\"javascript:alert(1)\">", "<img src=x onerror=\\x00\"javascript:alert(1)\">", "<a href=java&#1&#2&#3&#4&#5&#6&#7&#8&#11&#12script:javascript:alert(1)>XXX</a>", "<img src=\"x` `<script>javascript:alert(1)</script>\"` `>", "<img src onerror /\" '\"= alt=javascript:alert(1)//\">", "<title onpropertychange=javascript:alert(1)></title><title title=>", "<a href=http://foo.bar/#x=`y></a><img alt=\"`><img src=x:x onerror=javascript:alert(1)></a>\">", "<!--[if]><script>javascript:alert(1)</script -->", "<!--[if<img src=x onerror=javascript:alert(1)//]> -->", "<script src=\"/\\%(jscript)s\"></script>", "<script src=\"\\\\%(jscript)s\"></script>", "<IMG \"\"\"><SCRIPT>alert(\"XSS\")</SCRIPT>\">", "<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>", "<IMG SRC=# onmouseover=\"alert('xxs')\">", "<IMG SRC= onmouseover=\"alert('xxs')\">", "<IMG onmouseover=\"alert('xxs')\">", "<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;>", "<IMG SRC=&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041>", "<IMG SRC=&#x6A&#x61&#x76&#x61&#x73&#x63&#x72&#x69&#x70&#x74&#x3A&#x61&#x6C&#x65&#x72&#x74&#x28&#x27&#x58&#x53&#x53&#x27&#x29>", "<IMG SRC=\"jav   ascript:alert('XSS');\">", "<IMG SRC=\"jav&#x09;ascript:alert('XSS');\">", "<IMG SRC=\"jav&#x0A;ascript:alert('XSS');\">", "<IMG SRC=\"jav&#x0D;ascript:alert('XSS');\">", "perl -e 'print \"<IMG SRC=java\\0script:alert(\\\"XSS\\\")>\";' > out", "<IMG SRC=\" &#14;  javascript:alert('XSS');\">", "<SCRIPT/XSS SRC=\"http://ha.ckers.org/xss.js\"></SCRIPT>", "<BODY onload!#$%&()*~+-_.,:;?@[/|\\]^`=alert(\"XSS\")>", "<SCRIPT/SRC=\"http://ha.ckers.org/xss.js\"></SCRIPT>", "<<SCRIPT>alert(\"XSS\");//<</SCRIPT>", "<SCRIPT SRC=http://ha.ckers.org/xss.js?< B >", "<SCRIPT SRC=//ha.ckers.org/.j>", "<IMG SRC=\"javascript:alert('XSS')\"", "<iframe src=http://ha.ckers.org/scriptlet.html <", "\\\";alert('XSS');//", "<u oncopy=alert()> Copy me</u>", "<i onwheel=alert(1)> Scroll over me </i>", "<plaintext>", "http://a/%%30%30", "</textarea><script>alert(123)</script>", "1;DROP TABLE users", "1'; DROP TABLE users-- 1", "' OR 1=1 -- 1", "' OR '1'='1"];
		return script_naughty[Math.floor(Math.random() * script_naughty.length)];
	}

};