/* Live Bus Stop Info */

/* Magic Mirror
 * Module: UK Live Bus Stop Info
 *
 * By Nick Wootton
 * based on SwissTransport module by Benjamin Angst http://www.beny.ch
 * MIT Licensed.
 */

Module.register("MMM-UKLiveBusStopInfo", {
  // Define module defaults
  defaults: {
    updateInterval: 5 * 60 * 1000, // Update every 5 minutes.
    animationSpeed: 2000,
    fade: true,
    fadePoint: 0.25, // Start on 1/4th of the list.
    initialLoadDelay: 0, // start delay seconds.

    apiBase: "https://api.tfl.gov.uk/StopPoint/{atcocode}/arrivals?app_id={app_id}&app_key={app_key}",

    atcocode: "", // atcocode for bus stop
    app_key: "", // TransportAPI App Key
    app_id: "", // TransportAPI App ID
    group: "no", //Stops buses being grouped by route

    limit: 50, //Maximum number of results to display

    nextBuses: "no", //Use NextBuses API calls
    showRealTime: false, //expanded info when used with NextBuses
    showDelay: false, //expanded info when used with NextBuses
    showBearing: false, //show compass direction bearing on stop name
    maxDelay: -60, //if a bus is delayed more than 60 minutes exclude it
    debug: false,
  },

  // Define required scripts.
  getStyles: function () {
    return ["bus.css", "font-awesome.css"];
  },

  // Define required scripts.
  getScripts: function () {
    return ["moment.js"];
  },

  //Define header for module.
  getHeader: function () {
    return this.data.header;
  },

  // Define start sequence.
  start: function () {
    Log.info("Starting module: " + this.name);

    // Set locale.
    moment.locale(config.language);

    this.buses = {};
    this.loaded = false;
    this.scheduleUpdate(this.config.initialLoadDelay);

    this.updateTimer = null;

    this.url = encodeURI(
      this.config.apiBase.replace("{atcocode}", this.config.atcocode).replace("{app_id}", this.config.app_id).replace("{app_key}", this.config.app_key)
    );

    this.updateBusInfo(this);
  },

  // updateBusInfo IF module is visible (allows saving credits when using MMM-ModuleScheduler to hide the module)
  updateBusInfo: function (self) {
    if (this.hidden != true) {
      self.sendSocketNotification("GET_BUSINFO", { url: self.url });
    }
  },

  // Override dom generator.
  getDom: function () {
    var wrapper = document.createElement("div");

    if (this.config.atcocode === "") {
      wrapper.innerHTML = "Please set the ATCO Code: " + this.atcocode + ".";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (this.config.app_id === "") {
      wrapper.innerHTML = "Please set the application ID: " + this.app_id + ".";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (this.config.app_key === "") {
      wrapper.innerHTML =
        "Please set the application key: " + this.app_key + ".";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (!this.loaded) {
      wrapper.innerHTML = "Loading bus Info ...";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    // if (this.buses.stopName !== null) {
    //   this.config.header = this.buses.stopName;
    // }

    //Dump bus data
    if (this.config.debug) {
      Log.info(this.buses);
    }

    // *** Start Building Table
    var bustable = document.createElement("table");
    bustable.className = "small";

    //If we have departure info
    if (this.buses.data.length > 0) {
      for (var t in this.buses.data.sort((a, b) => {
        if (a.timeToStation < b.timeToStation) {
          return -1;
        }
        if (a.timeToStation > b.timeToStation) {
          return 1;
        }
        return 0;
      })) {
        /*
        {
        "lineName": "K2",
        "destinationName": "Kingston Hospital",
        "timeToStation": 538,
        }
        */

        var bus = this.buses.data[t];

        var row = document.createElement("tr");
        bustable.appendChild(row);

        //Route name/Number
        var routeCell = document.createElement("td");
        routeCell.className = "route bright";
        routeCell.innerHTML = " " + bus.lineName + " ";
        row.appendChild(routeCell);

        //Direction Info
        var directionCell = document.createElement("td");
        directionCell.className = "dest";
        directionCell.innerHTML = bus.destinationName;
        row.appendChild(directionCell);

        //Time Tabled Departure
        var timeTabledCell = document.createElement("td");
        var mins = Math.floor(bus.timeToStation / 60);
        timeTabledCell.innerHTML = mins > 0 ? mins + " min" : "Due";
        let status = "";
        if (bus.timeToStation < 60 * 5) {
          status = "soon";
        }
        if (bus.timeToStation < 60 * 2) {
          status = "late";
        }
        timeTabledCell.className = "timeTabled " + status;
        row.appendChild(timeTabledCell);

        if (this.config.fade && this.config.fadePoint < 1) {
          if (this.config.fadePoint < 0) {
            this.config.fadePoint = 0;
          }
          var startingPoint = this.buses.length * this.config.fadePoint;
          var steps = this.buses.length - startingPoint;
          if (t >= startingPoint) {
            var currentStep = t - startingPoint;
            row.style.opacity = 1 - (1 / steps) * currentStep;
          }
        }
      }
    } else {
      var row1 = document.createElement("tr");
      bustable.appendChild(row1);

      var messageCell = document.createElement("td");
      messageCell.innerHTML = " " + this.buses.message + " ";
      messageCell.className = "bright";
      row1.appendChild(messageCell);

      var row2 = document.createElement("tr");
      bustable.appendChild(row2);

      //var timeCell = document.createElement("td");
      //timeCell.innerHTML = " " + this.buses.timestamp + " ";
      //timeCell.className = "bright";
      //row2.appendChild(timeCell);
    }

    wrapper.appendChild(bustable);
    // *** End building results table

    return wrapper;
  },

  /* processBuses(data)
   * Uses the received data to set the various values into a new array.
   */
  processBuses: function (data) {
    //Define object to hold bus data
    this.buses = {};
    //Define array of departure info
    this.buses.data = [];
    //Define timestamp of current data
    this.buses.timestamp = new Date();
    //Define message holder
    this.buses.message = null;

    //Check we have data back from API
    if (typeof data !== "undefined" && data !== null) {
      var counter = data.length;
      if (counter > 0) {
        this.buses.data = data.slice(0, this.config.limit);
      } else {
        //No departures returned - set error message
        this.buses.message = "No departures scheduled";
        if (this.config.debug) {
          Log.error("=======LEVEL 2=========");
          Log.error(this.buses);
          Log.error("^^^^^^^^^^^^^^^^^^^^^^^");
        }
      }
    } else {
      //No data returned - set error message
      this.buses.message = "No data returned";
      if (this.config.debug) {
        Log.error("=======LEVEL 1=========");
        Log.error(this.buses);
        Log.error("^^^^^^^^^^^^^^^^^^^^^^^");
      }
    }

    this.loaded = true;

    this.updateDom(this.config.animationSpeed);
  },

  /* getParams()
   * Generates an url with api parameters based on the config.
   * return String - URL params.
   */
  getParams: function () {
    var params = "?";
    params += "app_id=" + this.config.app_id;
    params += "&app_key=" + this.config.app_key;
    params += "&limit=" + this.config.limit;
    params += "&group=" + this.config.group;
    params += "&nextbuses=" + this.config.nextBuses.toLowerCase();

    //Log.info(params);
    return params;
  },

  /* scheduleUpdate()
   * Schedule next update.
   * argument delay number - Milliseconds before next update. If empty, this.config.updateInterval is used.
   */
  scheduleUpdate: function (delay) {
    var nextLoad = this.config.updateInterval;
    if (typeof delay !== "undefined" && delay >= 0) {
      nextLoad = delay;
    }

    var self = this;
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(function () {
      self.updateBusInfo(self);
    }, nextLoad);
  },

  // Process data returned
  socketNotificationReceived: function (notification, payload) {
    if (notification === "BUS_DATA" && payload.url === this.url) {
      this.processBuses(payload.data);
      this.scheduleUpdate(this.config.updateInterval);
    }
  },
});
