window.addEventListener('load', main);

async function main(){
	//global variables--------------------------------------------

	//consts
	const width = 500;
	const height = 500;

	const byteSize = height * width * 4;

	//variables
	let clicked = false;
	var points = [];

	var currentBrushR;
	var currentBrushAlpha;
	var eraseMode;

	var currentLayer = 0;
	var scaleConstant = 1.0;

	var currentTool; //0=paintbrush 1=eraser

	var sizeConstant = 100

	var sourceX, sourceY, sourceLeft, sourceTop;

	var lastPosX = -1;
	var lastPosY = -1;

	//core pointers to shared memory - be careful with these
	var instance;
	var memory;
	var pointer;

	//element bindings--------------------------------------------

	//canvas binds
	const canvas = document.getElementById('c');
	var rect = canvas.getBoundingClientRect();
	var ctx = canvas.getContext('2d');

	//area outside of canvas
	const windowShim = document.getElementById('windowShim');

	//main draw area, contains shim and canvas
	const drawArea = document.getElementById('drawArea');

	//color selection control
	const colorPicker = document.getElementById('brushC');

	//brush selection control
	const circleButton = document.getElementById("circlebrush");
	const squareButton = document.getElementById("squarebrush");
	const cursorButton = document.getElementById("cursorbrush");
	const eraseModeCheckbox = document.getElementById("eraseMode");

	//size control
	const sizeSlider = document.getElementById('sizeSlider');
	const sizeStatus = document.getElementById('size');

	//alpha control
	const alphaSlider = document.getElementById('alphaSlider');
	const alphaStatus = document.getElementById('alpha');

	//layer control ui
	const addLayer = document.getElementById('addLayer');
	const hideLayer = document.getElementById('hideLayer');
	const layersPicker = document.getElementById('layers');
	const layerStatusElement = document.getElementById('layerStatus');
	const clearBtn = document.getElementById('clear');

	//reset button
	const resetBtn = document.getElementById('reset');

	//save button
	const saveBtn = document.getElementById('save');
	//event listeners--------------------------------------------

	//shortcut keys
	document.addEventListener('keydown', handleShortcut);

	//window change events
	window,addEventListener('resize', updateBoundingRect);

	//layer handlers
	addLayer.addEventListener('click', addLayerHandler);
	hideLayer.addEventListener('click', hideLayerHandler);
	layersPicker.addEventListener('change', changeSelectedLayer);
	clearBtn.addEventListener('click', handleClearLayer);

	//main draw handlers
	canvas.addEventListener('mousemove', drawOnCanvas);
	canvas.addEventListener('mouseup', handleMouseUp);
	canvas.addEventListener('mousedown', handleMouseDown);
	canvas.addEventListener('mouseleave', handlePathEnd);

	//tool handlers
	circleButton.addEventListener('change', readRadio);
	squareButton.addEventListener('change', readRadio);
	eraseModeCheckbox.addEventListener('change', readEraseMode);

	//recalculate bounds on scroll
	drawArea.addEventListener('scroll', updateBoundingRect);	

	//brush controls
	sizeSlider.addEventListener('change', updateSize);
	alphaSlider.addEventListener('change', updateAlpha);
	colorPicker.addEventListener('change', updateColor);

	//reset global state
	resetBtn.addEventListener('click', handleFullReset);

	//save
	saveBtn.addEventListener('click', runExport);

	//core functions--------------------------------------------
	async function entry(){
		//init system
		const b2p = function bytesToPages(bytes) { return Math.ceil(bytes / 64_000); }
		memory = new WebAssembly.Memory({initial: 1000});
		let resp = await fetch("buffer.wasm");
		let bytes = await resp.arrayBuffer();

		const lI = await WebAssembly.instantiate(bytes, {
			env: { memory }
		});
		instance = lI.instance;

		console.log(instance);

		//allocate canvas and init
		pointer = instance.exports.allocate(width, height);
		instance.exports.initSystem();

		//place canvas buffer on screen
		updateCanvas();

		//update color picker
		updateColor();

		//read current brush
		readRadio();

		//check erase mode
		readEraseMode();

		//check size control
		updateSize();

		//check alpha
		updateAlpha();

		//update list of layers
		updateLayersHandler();
	}
	entry(); //run core function on init!

	function updateColor(){
		const hexValue = colorPicker.value.substring(1);
		const aRgbHex = hexValue.match(/.{1,2}/g);  

		const r = parseInt(aRgbHex[0], 16);
        const g = parseInt(aRgbHex[1], 16); //rgb 
        const b = parseInt(aRgbHex[2], 16);

        instance.exports.setColor(r, g, b);
	}
	
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

	function readEraseMode(){
		if(eraseModeCheckbox.checked){
			eraseMode = 1;
		} else {
			eraseMode = 0;
		}

		//do this as a hack, to init a full refresh of all properties. Will have to refactor later
		readRadio();
	}

	function updateSize(){
		currentBrushR = sizeSlider.value;
		sizeStatus.innerHTML = currentBrushR;
		
		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}

	function updateAlpha(){
		currentBrushAlpha = alphaSlider.value;
		alphaStatus.innerHTML = currentBrushAlpha;
		
		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}
	
	//layer control
	function getLayerStatus(){
		const layerArrayAddress = instance.exports.layerArrayAddress();
		const layerStatus = new Uint8Array(memory.buffer, layerArrayAddress, 10);

		return layerStatus;
	}

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
		updateCanvas();

		updateLayerVisibility();
	}

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

	function handleShortcut(e){
		if(e.keyCode == 187 && e.shiftKey){
			zoomIn();
		}
		if(e.keyCode == 189 && e.shiftKey){
			zoomOut();
		}
	}

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

	function handleMouseDown(e){
		let x = (event.clientX - rect.left) / scaleConstant;
	    let y = (event.clientY - rect.top) / scaleConstant;


	    sourceX = e.clientX;
	    sourceY = e.clientY;
	    sourceLeft = drawArea.scrollLeft;
	    sourceTop = drawArea.scrollTop;

	    clicked = true;

		if(!cursorButton.checked){
			instance.exports.startPath(x, y);
		}
	}

	function handleMouseUp(e){
		if(!cursorButton.checked){
			updateCanvas();
			instance.exports.endPath();
		}

		clicked = false;
	}

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

			updateCanvas()
		} else {
			if(clicked){
				drawArea.scroll(sourceLeft - (event.clientX - sourceX), sourceTop - (event.clientY - sourceY))
			}
		}
	}

	function handlePathEnd(e){
		if(clicked){
			clicked = false;
			instance.exports.endPath();
  		}

  		instance.exports.clearOverlay();
    	updateCanvas();
	}

  	function handleClearLayer(){
  		instance.exports.clearCurrentLayer();
		updateCanvas();
  	}

  	function handleFullReset(){
  		/*
			goal for this is to reset all canvas state back to its original place, to simulate
			"starting over" without having to reload the wasm binary, etc. Think of it as pressing a "new canvas"
			button
  		*/
  	}

  	function runExport(){
  		const dataURL = canvas.toDataURL("image/png");
  		const a = document.createElement('a');
  		a.href = dataURL;
  		a.download = "hello.png";
  		a.click();
  	}

  	//helper functions--------------------------------------------
  	function updateBoundingRect(){
		rect = canvas.getBoundingClientRect();
	}

	function updateCanvas(){
		instance.exports.blendLayers();

		const usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		const img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);
	}
}