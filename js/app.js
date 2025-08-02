// Helper function to download JSON
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Function to open sidebar with area data
function openSidebar(locationModel) {
    const currentData = locationModel.toJSON();

    // Extract gang name from notes if exists
    let gangName = "Neutral";
    let notes = currentData.notes || "";
    if (notes.includes("Gang:")) {
        const gangNoteParts = notes.split("Gang:");
        gangName = gangNoteParts[1].split("\n")[0].trim();
        notes = gangNoteParts.slice(1).join("\n").replace(/^[^\n]+\n?/, "").trim();
    }

    // Populate form fields
    document.getElementById('sidebar-title').textContent = currentData.title;
    document.getElementById('area-name').value = currentData.title;
    document.getElementById('area-notes').value = notes;

    // Populate gang selector
    const gangSelector = document.getElementById('gang-selector');
    gangSelector.innerHTML = gangs.map(gang =>
        `<option value="${gang.color}" ${gang.name === gangName ? 'selected' : ''}>
            ${gang.name}
        </option>`
    ).join('');

    // Update gang description
    const selectedGang = gangs.find(g => g.name === gangName) || gangs.find(g => g.name === "Neutral");
    document.querySelector('.gang-description').textContent = selectedGang.description;

    // Store current location model
    sidebar.dataset.locationId = locationModel.cid;

    // Open sidebar
    document.getElementById('sidebar').classList.add('open');
}

$(function() {
    var showCoordinations = true;
    var $types = $('.types');
    var onResize = function() {
        $types.css({
            maxHeight: $(window).height() - parseInt($types.css('marginTop'), 10) - parseInt($types.css('marginBottom'), 10) - parseInt($('header').height()) + 6,
        });
    };

    onResize();
    $(window).resize(onResize);

    var currentMarker;

    // Handlebars helpers
    Handlebars.registerHelper('timestampToSeconds', function(stamp) {
        stamp = stamp.split(':');
        return parseInt(stamp[0], 10) * 60 + parseInt(stamp[1], 10);
    });

    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
        return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('findIndexByColor', function(color) {
        return gangs.findIndex(g => g.color === color);
    });

    Handlebars.registerHelper('lookup', function(obj, index) {
        return obj[index];
    });

    var Vent = _.extend({}, Backbone.Events);

    // Location Model
    var LocationModel = Backbone.Model.extend({
        initialize: function() {
            var polyCoords = this.get('latlngarray');

            var marker = new google.maps.Polygon({
                paths: polyCoords,
                strokeColor: '#' + this.get('strokecolor'),
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#' + this.get('fillcolor'),
                fillOpacity: 0.35,
                zIndex: this.get('order') || 0,
            });

            var bounds = new google.maps.LatLngBounds();
            polyCoords.forEach(function(element, index) {
                bounds.extend(element);
            });

            var mapLabel = new MapLabel({
                position: bounds.getCenter(),
                text: this.get('title'),
                strokeWeight: 1,
                strokeColor: '#000000',
                fontColor: '#' + this.get('fillcolor'),
                zIndex: 10000,
            });

            this.collection = this.collection || {};
            this.category = this.collection.category;

            _.bindAll(this, 'markerClicked', 'updateVisuals');
            google.maps.event.addListener(marker, 'click', this.markerClicked);

            this.set({
                marker: marker,
                label: mapLabel,
                originalData: this.toJSON()
            });

            this.on('change:fillcolor change:strokecolor change:title', this.updateVisuals);
        },

        markerClicked: function() {
            Vent.trigger('location:clicked', this);
        },

        removeHighlight: function() {},

        highlightMarker: function() {
            if (currentMarker == this) {
                Vent.trigger('location:clicked', this);
            } else {
                if (currentMarker) {
                    currentMarker.removeHighlight();
                }
                mapView.closePopupLocation();
                currentMarker = this;
            }
        },

        updateVisuals: function() {
            this.get('marker').setOptions({
                fillColor: '#' + this.get('fillcolor'),
                strokeColor: '#' + this.get('strokecolor')
            });

            this.get('label').set({
                text: this.get('title'),
                fontColor: '#' + this.get('fillcolor')
            });
        },

        toCleanJSON: function() {
            return {
                title: this.get('title'),
                notes: this.get('notes'),
                order: this.get('order'),
                strokecolor: this.get('strokecolor'),
                fillcolor: this.get('fillcolor'),
                latlngarray: this.get('latlngarray')
            };
        },

        reset: function() {
            this.set(this.get('originalData'));
        }
    });
	var LocationsCollection = Backbone.Collection.extend({
		model: LocationModel,
	});
	var CategoryModel = Backbone.Model.extend({
		initialize: function () {
			this.name = this.get('name');
			this.icon = this.get('icon');
			this.enabled = this.get('enabled');
			this.locations = new LocationsCollection;
			this.locations.url = this.get('url');
			this.locations.on('add', function (model) {
				if (this.get('enabled')) {
					Vent.trigger('locations:visible', this.locations.models);
				}
			}, this);
		},

		fetch: function () {
			this.locations.fetch();
		},
	});
	var CategoriesCollection = Backbone.Collection.extend({
		model: CategoryModel,
		fetch: function () {
			this.chain().each(function (c) { c.locations.fetch() });
		},
	});
	var SectionModel = Backbone.Model.extend({
		initialize: function () {
			this.name = this.get('name');
			this.categories = this.get('categories');
		},
	});
	var SectionCollection = Backbone.Collection.extend({
		model: SectionModel,
		fetch: function () {
			this.chain().each(function (s) { s.categories.fetch() });
		},
		forView: function (type) {
			return this.map(function (s) {
				return {
					name: s.name,
					categories: s.categories.map(function (c) {
						return c.toJSON();
					}),
				};
			});
		},
	});
	var sections = new SectionCollection([
		new SectionModel({
			name: 'General',
			categories: new CategoriesCollection([
				new CategoryModel({
					name: 'Neighborhoods',
					icon: 'radar/radar_warehouse.png',
					enabled: false,
					url: 'data/neighborhoods.json',
				}),
				new CategoryModel({
					name: 'Neutral',
					icon: 'General/glitches.png',
					enabled: true,
					url: 'data/neutral.json',
				}),
				new CategoryModel({
					name: 'Medical',
					icon: 'radar/radar_hospital.png',
					enabled: true,
					url: 'data/medical.json',
				}),
				new CategoryModel({
					name: 'Legal & Impound Lots',
					icon: 'radar/radar_police_station.png',
					enabled: true,
					url: 'data/legal.json',
				}),
				new CategoryModel({
					name: 'Restaurants',
					icon: 'radar/radar_restaurant.png',
					enabled: true,
					url: 'data/restaurant.json',
				}),

			]),
		}),
		new SectionModel({
			name: 'Gang Related',
			categories: new CategoriesCollection([
				new CategoryModel({
					name: 'Gang Hood',
					icon: 'General/wall-breach.png',
					enabled: true,
					url: 'data/ganghood.json',
				}),
				new CategoryModel({
					name: 'Illegal Turf',
					icon: 'radar/radar_weed_stash.png',
					enabled: true,
					url: 'data/illegal_turf.json',
				}),
				new CategoryModel({
					name: 'Holding Zone',
					icon: 'radar/zone.png',
					enabled: true,
					url: 'data/zone.json',
				}),
				new CategoryModel({
					name: 'Heists',
					icon: 'radar/radar_heist.png',
					enabled: true,
					url: 'data/heists.json',
				}),

			]),
		}),

	]);

	var showingLabels;
	var CategoriesView = Backbone.View.extend({
		initialize: function () {
			this.template = Handlebars.compile($('#sectionTemplate').html());
		},

		render: function () {
			this.$el.html(
				this.template({
					sections: sections.forView(),
				})
			);
			$('#typeDetails').hide();
			return this;
		},

		events: {
			'change input': 'toggleLocations',
			'click .details': 'showDetails',
		},

		toggleLocations: function (e) {
			var $e = $(e.currentTarget),
				name = $e.val(),
				section = $e.data('section'),
				showLocations = $e.is(':checked');

			if (name == 'labels') {
				var allLocations = sections.chain()
					.map(function (s) {
						return s.categories.filter(function (c) {
							return c.get('enabled');
						});
					})
					.flatten()
					.map(function (c) {
						return c.locations.models;
					})
					.flatten()
					.value();

				if (showLocations) {
					Vent.trigger('labels:visible', allLocations);
					showingLabels = true;
				} else {
					Vent.trigger('labels:invisible', allLocations);
					showingLabels = false;
				}
				return;
			}

			category = sections.findWhere({ name: section }).categories.findWhere({ name: name });
			category.set('enabled', showLocations);

			var models = category.locations.models;
			if (showLocations) {
				Vent.trigger('locations:visible', models);
				if (showingLabels) {
					Vent.trigger('labels:visible', models);
				}
			} else {
				Vent.trigger('locations:invisible', models);
				if (showingLabels) {
					Vent.trigger('labels:invisible', models);
				}
			}
		},

		showDetails: function (e) {
			e.preventDefault();
			var section = $(e.currentTarget).data('section');
			var name = $(e.currentTarget).data('name');
			this.$el
				.find('input[value="' + name + '"][data-section="' + section + '"]')
				.prop('checked', true)
				.trigger('change');

			var details = new CategoryDetailsView({
				el: '#typeDetails',
				section: section,
				category: name,
			});
			details.render();
		},
	});

	var CategoryDetailsView = Backbone.View.extend({
		initialize: function () {
			this.template = Handlebars.compile($('#categoryDetailsTemplate').html());
		},

		events: {
			'click a.back': 'goBack',
			'click li': 'showMarker',
		},

		goBack: function (e) {
			e.preventDefault();
			this.$el.empty();
			this.off();
			$('#types').show();
		},

		showMarker: function (e) {
			var section = $(e.currentTarget).data('section');
			var name = $(e.currentTarget).data('name');

			var location = sections.findWhere({ name: section }).categories.findWhere({ name: name }).locations.findWhere({ title: $(e.currentTarget).text() });

			location.highlightMarker();
			var bounds = new google.maps.LatLngBounds();
			location
				.get('marker')
				.getPath()
				.forEach(function (element, index) {
					bounds.extend(element);
				});
			map.panTo(bounds.getCenter());
			map.setZoom(7);
		},

		render: function () {
			var section = this.options.section;
			var category = this.options.category;
			var locs = sections.findWhere({ name: section }).categories.findWhere({ name: category }).locations.models;

			this.$el.html(
				this.template({
					section: section,
					category: category,
					locations: _(locs).map(function (x) {
						var d = x.toJSON();
						return d;
					}),
				})
			);
			$('#types').hide();
			this.$el.show();
			return this;
		},

	});

	var MapView = Backbone.View.extend({
        initialize: function() {
            this.mapType = 'Satellite';
            this.mapDetails = {
                'Atlas': '#0FA8D2',
                'Satellite': '#143D6B',
                'Road': '#1862AD'
            };

            this.mapOptions = {
                center: new google.maps.LatLng(-60, -20),
                zoom: 3,
                disableDefaultUI: true,
                mapTypeId: this.mapType,
                backgroundColor: 'hsla(0, 0%, 0%, 0)'
            };

            _.bindAll(this, 'getTileImage', 'updateMapBackground');

            this.popupTemplate = Handlebars.compile($('#markerPopupTemplate2').html());

            this.listenTo(Vent, 'locations:visible', this.showLocations);
            this.listenTo(Vent, 'locations:invisible', this.hideLocations);
            this.listenTo(Vent, 'labels:visible', this.showLabels);
            this.listenTo(Vent, 'labels:invisible', this.hideLabels);
            this.listenTo(Vent, 'location:clicked', this.popupLocation);
        },

        render: function() {
            function updateCoordinationWindow(markerobject) {
                function getContent(evt) {
                    return '</p><p>{"lat": ' + evt.latLng.lat().toFixed(3) + ', "lng": ' + evt.latLng.lng().toFixed(3) + '},</p>';
                }

                var infoWindow = new google.maps.InfoWindow();

                google.maps.event.addListener(markerobject, 'click', function(evt) {
                    infoWindow.setOptions({ content: getContent(evt) });
                    infoWindow.open(map, markerobject);
                });

                google.maps.event.addListener(markerobject, 'drag', function(evt) {
                    infoWindow.setOptions({ content: getContent(evt) });
                });

                google.maps.event.addListener(markerobject, 'rightclick', function(evt) {
                    const index = window.locs.indexOf(markerobject);
                    if (index > -1) {
                        window.locs.splice(index, 1);
                        markerobject.setMap(null);
                        window.locs.forEach(function(item, index) {
                            item.setLabel(String(index));
                        });
                    }
                });
            }

            var map = (this.map = window.map = new google.maps.Map(this.el, this.mapOptions));

            this.initMapTypes(map, _.keys(this.mapDetails));
            google.maps.event.addListener(map, 'maptypeid_changed', this.updateMapBackground);

            google.maps.event.addDomListener(map, 'tilesloaded', function() {
                if ($('#mapControlWrap').length == 0) {
                    $('div.gmnoprint').last().wrap('<div id="mapControlWrap" />');
                }
            });

            window.locs = [];
            google.maps.event.addListener(map, 'rightclick', function(e) {
                var marker = new google.maps.Marker({
                    map: map,
                    moveable: true,
                    draggable: true,
                    position: e.latLng,
                    label: String(window.locs.length),
                });
                window.locs.push(marker);
                if (showCoordinations) {
                    updateCoordinationWindow(marker);
                }
            });

            return this;
        },

		getMap: function () {
			return this.map;
		},

		initMapTypes: function (map, types) {
			_.each(
				types,
				function (type) {
					var mapTypeOptions = {
						minZoom: 1,
						maxZoom: 7,
						name: type,
						getTileUrl: this.getTileImage,
					};
					map.mapTypes.set(type, new google.maps.ImageMapType(mapTypeOptions));
				},
				this
			);
		},

		updateMapBackground: function () {
			this.mapType = this.map.getMapTypeId();
			this.$el.css({
				backgroundColor: this.mapDetails[this.mapType],
			});
		},

		getTileImage: function (rawCoordinates, zoomLevel) {
			var coord = this.normalizeCoordinates(rawCoordinates, zoomLevel);
			if (!coord) {
				return null;
			}
			return 'tiles/' + this.mapType.toLowerCase() + '/' + zoomLevel + '/' + coord.x + '_' + coord.y + '.png';
		},

		normalizeCoordinates: function (coord, zoom) {
			var y = coord.y;
			var x = coord.x;

			// tile range in one direction range is dependent on zoom level
			// 0 = 1 tile, 1 = 2 tiles, 2 = 4 tiles, 3 = 8 tiles, etc
			var tileRange = 1 << zoom;

			// don't repeat across y-axis (vertically)
			if (y < 0 || y >= tileRange) {
				return null;
			}

			// repeat across x-axis
			if (x < 0 || x >= tileRange) {
				x = ((x % tileRange) + tileRange) % tileRange;
			}

			return {
				x: x,
				y: y,
			};
		},

		showLocations: function (locations) {
			_.each(
				locations,
				function (location) {
					var marker = location.get('marker');
					if (!marker.getMap()) {
						marker.setMap(this.map);
					}
					marker.setVisible(true);
				},
				this
			);
		},

		showLabels: function (locations) {
			_.each(
				locations,
				function (location) {
					var label = location.get('label');
					if (!label.getMap()) {
						label.setMap(this.map);
					}
					label.set('fontSize', 16);
				},
				this
			);
		},

		hideLocations: function (locations) {
			_.each(locations, function (location) {
				location.get('marker').setVisible(false);
			});
		},

		hideLabels: function (locations) {
			_.each(locations, function (location) {
				var label = location.get('label');
				if (!label.getMap()) {
					label.setMap(this.map);
				}
				label.set('fontSize', 0);
			});
		},

		popupLocation: function(location, panTo) {
            this.closePopupLocation();
            this.currentLocation = location;
            
            var bounds = new google.maps.LatLngBounds();
            location.get('marker').getPath().forEach(function(element, index) {
                bounds.extend(element);
            });
            
            if (panTo !== false) {
                this.map.panTo(bounds.getCenter());
                this.map.setZoom(14);
            }
            
            openSidebar(location);
            
            // Set up event listeners if not already done
            if (!this.sidebarListenersSet) {
                const gangSelector = document.getElementById('gang-selector');
                
                gangSelector.addEventListener('change', function() {
                    const selectedColor = this.value;
                    const selectedGang = getGangByColor(selectedColor);
                    if (selectedGang) {
                        document.querySelector('.gang-description').textContent = selectedGang.description;
                    }
                });

                document.getElementById('save-area').addEventListener('click', () => {
                    const newName = document.getElementById('area-name').value.trim();
                    if (!newName) {
                        alert("Area name cannot be empty");
                        return;
                    }
                    
                    const selectedColor = gangSelector.value;
                    const selectedGang = getGangByColor(selectedColor);
                    const newNotes = document.getElementById('area-notes').value;
                    
                    location.get('marker').setOptions({
                        fillColor: '#' + selectedColor,
                        strokeColor: '#' + selectedColor
                    });
                    
                    location.get('label').set({
                        text: newName,
                        fontColor: '#' + selectedColor
                    });
                    
                    location.set({
                        title: newName,
                        notes: 'Gang: ' + selectedGang.name + '\n' + newNotes,
                        fillcolor: selectedColor,
                        strokecolor: selectedColor
                    });
                    
                    document.getElementById('sidebar').classList.remove('open');
                });

                this.sidebarListenersSet = true;
            }
        },
	});

	var mapView = new MapView({ el: '#map' });
    var categoriesView = new CategoriesView({ el: '#types', map: mapView.getMap() });

    sections.fetch();
    mapView.render();
    categoriesView.render();

    // Initialize sidebar close buttons
    document.querySelector('.close-sidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });

    document.getElementById('cancel-edit').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });

    // Export functionality
    document.getElementById('export-area').addEventListener('click', () => {
        const locationModel = mapView.currentLocation;
        if (locationModel) {
            const areaData = locationModel.toCleanJSON();
            downloadJSON(areaData, `${areaData.title.replace(/\s+/g, '_')}.json`);
        }
    });

    document.getElementById('export-all').addEventListener('click', () => {
        const allLocations = sections.chain()
            .map(s => s.categories.models)
            .flatten()
            .map(c => c.locations.models)
            .flatten()
            .map(l => l.toCleanJSON())
            .value();
        downloadJSON(allLocations, 'all_areas.json');
    });
});

	document.getElementById('export-area').addEventListener('click', () => {
		const locationModel = mapView.currentLocation;
		if (locationModel) {
			const areaData = locationModel.toJSON();
			downloadJSON(areaData, `${areaData.title.replace(/\s+/g, '_')}.json`);
		}
	});

	document.getElementById('export-all').addEventListener('click', () => {
		// Get all locations from your data structure
		const allLocations = sections.chain()
			.map(s => s.categories.models)
			.flatten()
			.map(c => c.locations.models)
			.flatten()
			.map(l => l.toJSON())
			.value();

		downloadJSON(allLocations, 'all_areas.json');
	});
	// Sidebar Event Listeners
document.getElementById('gang-selector').addEventListener('change', function() {
    const selectedColor = this.value;
    const selectedGang = gangs.find(g => g.color === selectedColor);
    if (selectedGang) {
        document.querySelector('.gang-description').textContent = selectedGang.description;
    }
});

document.querySelector('.close-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
});

document.getElementById('cancel-edit').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
});

// function printArray() {
// 	var msg = 'Submit new regions here:\n'
// 	+ 'https://github.com/skyrossm/np-gangmap/issues\n\n'
// 	+ 'Right click the map to add points to the region. You may have to toggle regions off to be able to right click on the bottom layer. Fill in the values marked "<edit here>" and title the new issue using the format: "Add <title> region". Copy and paste everything below this. If your browser does not support selecting the text below press F12 to open the developer console and copy it from there. (scroll down)\n\n';
// 	msg += '```json\n\t{\n\t\t"type": "Territories",'
// 	+ '\n\t\t"title": "<edit this>",'
// 	+ '\n\t\t"notes": "<edit this>",'
// 	+ '\n\t\t"wiki_link": "https://nopixel.fandom.com/wiki/<edit this>",'
// 	+ '\n\t\t"order": 0,'
// 	+ '\n\t\t"strokecolor": "FF0000",'
// 	+ '\n\t\t"fillcolor": "FF0000",'
// 	+ '\n\t\t"latlngarray": [\n';
// 	var i;
// 	for (i = 0; i < window.locs.length; i++) {
// 		msg += '\t\t\t{"lat": ' + window.locs[i].position.lat().toFixed(3) + ', "lng": ' + window.locs[i].position.lng().toFixed(3) + '}' + (window.locs.length - 1 == i ? '' : ',') + '\n';
// 	}
// 	msg += '\t\t]'
// 	+ '\n\t},\n```';
// 	alert(msg);
// 	console.log(msg);
// }

function printArray() {
	var msg = 'Submit new regions by pasting this:\n'

	msg += '```json\n\t{\n\t\t"type": "Territories",'
		+ '\n\t\t"title": "<edit this>",'
		+ '\n\t\t"notes": "<edit this>",'
		+ '\n\t\t"wiki_link": "https://nopixel.fandom.com/wiki/<edit this>",'
		+ '\n\t\t"order": 0,'
		+ '\n\t\t"strokecolor": "FF0000",'
		+ '\n\t\t"fillcolor": "FF0000",'
		+ '\n\t\t"latlngarray": [\n';

	for (var i = 0; i < window.locs.length; i++) {
		msg += '\t\t\t{"lat": ' + window.locs[i].position.lat().toFixed(3) + ', "lng": ' + window.locs[i].position.lng().toFixed(3) + '}' + (window.locs.length - 1 == i ? '' : ',') + '\n';
	}

	msg += '\t\t]\n\t},\n```';

	navigator.clipboard.writeText(msg).then(function () {
		alert("JSON copied to clipboard! You can now paste it.");
	}).catch(function (err) {
		alert("Failed to copy. Please copy manually: \n\n" + msg);
	});
}


function toggleRuler() {
	addruler(window.map);
}

function addruler(map) {
	ruler1 = new google.maps.Marker({
		position: map.getCenter(),
		map: map,
		draggable: true,
	});

	ruler2 = new google.maps.Marker({
		position: map.getCenter(),
		map: map,
		draggable: true,
	});

	var ruler1label = new Label({ map: map, position: map.getCenter(), text: '0m' });

	rulerpoly = new google.maps.Polyline({
		path: [ruler1.position, ruler2.position],
		strokeColor: '#FFFF00',
		strokeOpacity: 0.7,
		strokeWeight: 8,
	});
	rulerpoly.setMap(map);

	google.maps.event.addListener(ruler1, 'drag', function () {
		ruler1label.set('position', ruler1.position);
		rulerpoly.setPath([ruler1.getPosition(), ruler2.getPosition()]);
		ruler1label.set('text', distance(ruler1.getPosition().lat(), ruler1.getPosition().lng(), ruler2.getPosition().lat(), ruler2.getPosition().lng()));
	});

	google.maps.event.addListener(ruler2, 'drag', function () {
		rulerpoly.setPath([ruler1.getPosition(), ruler2.getPosition()]);
		ruler1label.set('text', distance(ruler1.getPosition().lat(), ruler1.getPosition().lng(), ruler2.getPosition().lat(), ruler2.getPosition().lng()));
	});

	ruler1.setVisible(true);
	ruler2.setVisible(true);
	rulerpoly.setVisible(true);
}

function distance(lat1, lon1, lat2, lon2) {
	var um = 'km'; // km | ft (choose the constant)
	var R = 1800;
	if (um == 'ft') {
		R = 20924640; // ft
	}
	var dLat = ((lat2 - lat1) * Math.PI) / 180;
	var dLon = ((lon2 - lon1) * Math.PI) / 180;
	var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	var d = R * c * 4;
	return Math.round(d) + 'm';
}

// Define the overlay, derived from google.maps.OverlayView
function Label(opt_options) {
	// Initialization
	this.setValues(opt_options);

	// Label specific
	var span = (this.span_ = document.createElement('span'));
	span.style.cssText =
		'position: relative; left: 0%; top: -8px; ' +
		'white-space: nowrap; border: 0px; font-family:arial; font-weight:bold;' +
		'padding: 2px; background-color: #ddd; ' +
		'opacity: 1; ' +
		'filter: alpha(opacity=75); ' +
		'-ms-filter: "alpha(opacity=75)"; ' +
		'-khtml-opacity: 1; ' +
		'z-index:1000';

	var div = (this.div_ = document.createElement('div'));
	div.appendChild(span);
	div.style.cssText = 'position: absolute; display: none';
}
Label.prototype = new google.maps.OverlayView();

// Implement onAdd
Label.prototype.onAdd = function () {
	var pane = this.getPanes().overlayLayer;
	pane.appendChild(this.div_);

	// Ensures the label is redrawn if the text or position is changed.
	var me = this;
	this.listeners_ = [
		google.maps.event.addListener(this, 'position_changed', function () {
			me.draw();
		}),
		google.maps.event.addListener(this, 'text_changed', function () {
			me.draw();
		}),
	];
};

// Implement onRemove
Label.prototype.onRemove = function () {
	this.div_.parentNode.removeChild(this.div_);
	// Label is removed from the map, stop updating its position/text.
	for (var i = 0, I = this.listeners_.length; i < I; ++i) {
		google.maps.event.removeListener(this.listeners_[i]);
	}
};

// Implement draw
Label.prototype.draw = function () {
	var projection = this.getProjection();
	var position = projection.fromLatLngToDivPixel(this.get('position'));

	var div = this.div_;
	div.style.left = position.x + 'px';
	div.style.top = position.y + 'px';
	div.style.display = 'block';

	this.span_.innerHTML = this.get('text').toString();
};


window.addEventListener("load", function () {
	setTimeout(function () {
		document.getElementById("preloader").style.display = "none";
	}, 1500);
});
