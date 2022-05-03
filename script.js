window.addEventListener('load', main);

async function main(){
	//globals
	const canvas = document.getElementById('c');
	var rect = canvas.getBoundingClientRect();

	let clicked = false;

	var ctx = canvas.getContext('2d');
	console.log(ctx);

	const width = 500;
	const height = 500;

	const byteSize = height * width * 4;

	var points = [];

	var currentBrushR;
	var currentBrushAlpha;
	var eraseMode;

	var currentLayer = 0;

	var scaleConstant = 1.0;

	//init system
	const b2p = function bytesToPages(bytes) { return Math.ceil(bytes / 64_000); }
	const memory = new WebAssembly.Memory({initial: 1000});
	let resp = await fetch("buffer.wasm");
	let bytes = await resp.arrayBuffer();

	const { instance } = await WebAssembly.instantiate(bytes, {
		env: { memory }
	});

	function allocateSystem(){
		
	}
	

	var pointer = instance.exports.allocate(width, height);
	instance.exports.initSystem();

	//testing only
	instance.exports.blendLayers();
	var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
	img = new ImageData(usub, width, height);
	ctx.putImageData(img, 0, 0);



	//function handlers here 
	var img;
	
	//color selection control
	const colorPicker = document.getElementById('brushC');
	function updateColor(){
		const hexValue = colorPicker.value.substring(1);
		const aRgbHex = hexValue.match(/.{1,2}/g);  

		const r = parseInt(aRgbHex[0], 16);
        const g = parseInt(aRgbHex[1], 16); //rgb 
        const b = parseInt(aRgbHex[2], 16);

        instance.exports.setColor(r, g, b);
	}
	updateColor();

	//brush selection control
	const circleButton = document.getElementById("circlebrush");
	const squareButton = document.getElementById("squarebrush");
	const cursorButton = document.getElementById("cursorbrush");
	var currentTool; //0=paintbrush 1=eraser
	function readRadio(){
		if(circleButton.checked){
			updateColor();
			currentTool = 0;

		}
		if(squareButton.checked){
			updateColor();
			currentTool = 1;
		}

		if(cursorButton.checked){
			 //TODO: make tool do nothing, equiv of "put down brush"
		}	

		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}
	readRadio();

	//erase mode control (v2)
	const eraseModeCheckbox = document.getElementById("eraseMode");
	function readEraseMode(){
		if(eraseModeCheckbox.checked){
			eraseMode = 1;
		} else {
			eraseMode = 0;
		}

		//do this as a hack, to init a full refresh of all properties. Will have to refactor later
		readRadio();
	}
	readEraseMode();

	//size control
	const sizeSlider = document.getElementById('sizeSlider');
	const sizeStatus = document.getElementById('size');
	function updateSize(){
		currentBrushR = sizeSlider.value;
		sizeStatus.innerHTML = currentBrushR;
		
		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}
	updateSize();

	//alpha control
	const alphaSlider = document.getElementById('alphaSlider');
	const alphaStatus = document.getElementById('alpha');
	function updateAlpha(){
		currentBrushAlpha = alphaSlider.value;
		alphaStatus.innerHTML = currentBrushAlpha;
		
		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}
	updateAlpha();

	//layer control
	function getLayerStatus(){
		const layerArrayAddress = instance.exports.layerArrayAddress();
		const layerStatus = new Uint8Array(memory.buffer, layerArrayAddress, 10);

		return layerStatus;
	}

	const addLayer = document.getElementById('addLayer');
	const hideLayer = document.getElementById('hideLayer');
	const layersPicker = document.getElementById('layers');

	function changeSelectedLayer(){
		currentLayer = layers.value;

		instance.exports.selectActiveLayer(currentLayer);
		updateLayerVisibility();
	}

	function addLayerHandler(){
		instance.exports.addLayer();
		
		updateLayersHandler();
		updateLayerVisibility();
	}	

	function hideLayerHandler(){
		instance.exports.toggleLayerVisibility(currentLayer);

		instance.exports.blendLayers();
		var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);

		updateLayerVisibility();
	}

	const layerStatusElement = document.getElementById('layerStatus');
	function updateLayerVisibility(){
		const layerStatus = getLayerStatus();

		if(layerStatus[currentLayer] == 2){
			layerStatusElement.innerHTML = 'layer is not hidden';
		} else if (layerStatus[currentLayer] == 1){
			layerStatusElement.innerHTML = 'layer is hidden';
		} else {
			layerStatusElement.innerHTML = 'oops'
		}
	}

	function updateLayersHandler(){
		const layerStatus = getLayerStatus();
		//clear layers field
		layersPicker.innerHTML = ' ';

		for(let i = 0; i < layerStatus.length; i++){
			if(layerStatus[i] == 0) continue;

			//create new option value
			const layerOption = document.createElement('option');
			layerOption.innerHTML = `layer ${i}`;
			layerOption.value = i;

			layersPicker.appendChild(layerOption);
		}

		//reselect
		layers.value = currentLayer;
	}
	updateLayersHandler();

	//scaling controls
	const windowShim = document.getElementById('windowShim');
	document.addEventListener('keydown', handleShortcut);

	function handleShortcut(e){
		console.log(e.keyCode);

		if(e.keyCode == 187 && e.shiftKey){
			zoomIn();
		}
		if(e.keyCode == 189 && e.shiftKey){
			zoomOut();
		}
	}

	let sizeConstant = 100
	function zoomIn(){
		scaleConstant += 0.1;
		canvas.style.transform = `scale(${scaleConstant})`;
		
		sizeConstant += 100
		windowShim.style.padding= `${sizeConstant}px`;
		drawArea.scroll(sizeConstant + (lastPosX - 250), sizeConstant + (lastPosX - 250));

		rect = canvas.getBoundingClientRect();
	}

	function zoomOut(){
		scaleConstant -= 0.1;
		canvas.style.transform = `scale(${scaleConstant})`;

		sizeConstant -= 100
		windowShim.style.padding= `${sizeConstant}px`;

		drawArea.scroll(sizeConstant - (lastPosX - 250), sizeConstant - (lastPosX - 250));

		rect = canvas.getBoundingClientRect();
	}

	//window resize handling
	window,addEventListener('resize', calcOffset);
	function calcOffset(){
		rect = canvas.getBoundingClientRect();
	}

	//general cursor handlers

	//resz
	const drawArea = document.getElementById('drawArea');
	drawArea.addEventListener('scroll', function(e){
		rect = canvas.getBoundingClientRect();
	})

	var sourceX, sourceY, sourceLeft, sourceTop;

	canvas.addEventListener('mousedown', function(e){
		let x = (event.clientX - rect.left) / scaleConstant;
	    let y = (event.clientY - rect.top) / scaleConstant;


	    sourceX = e.clientX;
	    sourceY = e.clientY;
	    sourceLeft = drawArea.scrollLeft;
	    sourceTop = drawArea.scrollTop;

	    clicked = true;

		if(!cursorButton.checked){
			instance.exports.startPath(x, y);
			instance.exports.blendLayers();
		}


	});

	canvas.addEventListener('mouseup', function(e){
		if(!cursorButton.checked){
			var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
			img = new ImageData(usub, width, height);
			ctx.putImageData(img, 0, 0);

			instance.exports.endPath();
		}

		clicked = false;
	});

	canvas.addEventListener('mousemove', (e) => drawOnCanvas(e));

	var lastPosX = -1;
	var lastPosY = -1;

	function drawOnCanvas(event){
		let x = (event.clientX - rect.left) / scaleConstant;
		let y = (event.clientY - rect.top) / scaleConstant;

		lastPosX = x;
		lastPosY = y;

		if(!cursorButton.checked){
			instance.exports.setOverlay(x, y);

			if(clicked){
				points.push([x, y]);

				if(points.length > 1){ //flosting avg
					var ax = 0;
					var ay = 0;
					for(let i = 0; i < points.length; i++){
						ax += points[i][0];
						ay += points[i][1];
					}
					ax /= points.length;
					ay /= points.length;

					instance.exports.addPoint(x, y);

					points = [];
				}
			} 

			instance.exports.blendLayers();

			var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
			img = new ImageData(usub, width, height);
			ctx.putImageData(img, 0, 0);
		} else {
			if(clicked){
				drawArea.scroll(sourceLeft - (event.clientX - sourceX), sourceTop - (event.clientY - sourceY))
			}
		}
	}

  	canvas.addEventListener('mouseleave', function(e){
  		if(clicked){
			clicked = false;
			instance.exports.endPath();
  		}

  		instance.exports.clearOverlay();
  		instance.exports.blendLayers();

    	var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);
  	});


	const clearBtn = document.getElementById('clear');
	clearBtn.addEventListener('click', function(e) {
		instance.exports.clearCurrentLayer();
		instance.exports.blendLayers();

		var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);
	});

	const resetBtn = document.getElementById('reset');
	resetBtn.addEventListener('click', function(e) {

	})

	sizeSlider.addEventListener('change', function(e) {
		updateSize();
	});

	alphaSlider.addEventListener('change', function(e) {
		updateAlpha();
	});

	colorPicker.addEventListener('change', function(e){
		updateColor();
	})

	circleButton.addEventListener('change', readRadio);
	squareButton.addEventListener('change', readRadio);

	eraseModeCheckbox.addEventListener('change', readEraseMode);	

	//layer mode
	addLayer.addEventListener('click', addLayerHandler);
	hideLayer.addEventListener('click', hideLayerHandler);
	layersPicker.addEventListener('change', changeSelectedLayer);
}