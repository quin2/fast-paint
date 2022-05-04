#include <stdlib.h>
#include <math.h>  
#include <stdint.h> 

int* ptr;
int* screen;
int WIDTH;
int HEIGHT;

int R;

int* buffer;
int* brush;
int* brushGuide;

int oldx = -1;
int oldy = -1;

int* alphaMask;
int* overlay;

int RED;
int BLUE;
int GREEN;
int ALPHA;

struct point
{
	int u;
	int v;
};

struct point pA;
struct point pB;

int eraseMode;

//variables for layers API
uint8_t layers[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}; //initialize as all "invisible"
int maxLayers = 10;

int cL; 		//layer number we are drawing on
int layerCount;	//number of layers at the moment

int** layersPtr; //array containing layer data


uint32_t AlphaBlendPixels(uint32_t p1, uint32_t p2)
{
    static const int AMASK = 0xFF000000;
    static const int RBMASK = 0x00FF00FF;
    static const int GMASK = 0x0000FF00;
    static const int AGMASK = AMASK | GMASK;
    static const int ONEALPHA = 0x01000000;
    unsigned int a = (p2 & AMASK) >> 24;
    unsigned int na = 255 - a;
    unsigned int rb = ((na * (p1 & RBMASK)) + (a * (p2 & RBMASK))) >> 8;
    unsigned int ag = (na * ((p1 & AGMASK) >> 8)) + (a * (ONEALPHA | ((p2 & GMASK) >> 8)));
    return ((rb & RBMASK) | (ag & AGMASK));
}

//exposed webassembly method
int* allocate(int width, int height){
	WIDTH = width;
	HEIGHT = height;

	int n = width * height * 4;
	screen = (int*)malloc(n * sizeof(int));

	return screen;
}

void setBrushPixel(int *brush, int width, int x, int y, int value){
	brush[x + (y * width)] = value;
}

void drawBrushLine(int *brush, int width, int x, int start_y, int end_y, int alpha){
	for(int i = start_y; i <= end_y; i++){
		setBrushPixel(brush, width, x, i, alpha);
	}
}

void drawBrushLineH(int *brush, int width, int start_x, int end_x, int y, int alpha){
	for(int i = start_x; i <= end_x; i++){
		setBrushPixel(brush, width, i, y, alpha);
	}
}

void setPixel4(int *brush, int *brushGuide, int width, int cx, int cy, int dx, int dy, int alpha, int flood, int direction){
	if(direction == 1){
		drawBrushLine(brush, width, (cx + dx), (cy - dy), (cy + dy), flood);
		drawBrushLine(brush, width, (cx - dx), (cy - dy), (cy + dy), flood);
	}
	else if(direction == 0){
		drawBrushLineH(brush, width, (cx - dx), (cx + dx), (cy + dy), flood);
		drawBrushLineH(brush, width, (cx - dx), (cx + dx), (cy - dy), flood);
	}
	
	//draw anti-aa outline	
	setBrushPixel(brush, width, cx + dx, cy + dy, alpha);
	setBrushPixel(brush, width, cx - dx, cy + dy, alpha);
	setBrushPixel(brush, width, cx + dx, cy - dy, alpha);
	setBrushPixel(brush, width, cx - dx, cy - dy, alpha);

	//draw brush guide
	setBrushPixel(brushGuide, width, cx + dx, cy + dy, 255);
	setBrushPixel(brushGuide, width, cx - dx, cy + dy, 255);
	setBrushPixel(brushGuide, width, cx + dx, cy - dy, 255);
	setBrushPixel(brushGuide, width, cx - dx, cy - dy, 255);
}

//see https://stackoverflow.com/questions/54594822/xiaolin-wu-circle-algorithm-renders-circle-with-holes-inside
void computeAACircleMask(int width, double alpha, int *brush, int *brushGuide){
	int r = R - 1;
	float maxTransparency = 255.0 * (float)alpha;

	float radiusX = r;
	float radiusY = r;
	float radiusX2 = radiusX * radiusX;
	float radiusY2 = radiusY * radiusY;

	int drawLinesDirection = 1;

	float quarter = roundf(radiusX2 / sqrtf(radiusX2 + radiusY2));
	for(float _x = 0; _x <= quarter; _x++) {
	    float _y = radiusY * sqrtf(1 - _x * _x / radiusX2);
	    float error = _y - floorf(_y);

	    float transparency = roundf(error * maxTransparency);
	    int alpha = transparency;
	    int alpha2 = maxTransparency - transparency;

	    setPixel4(brush, brushGuide, width, r, r, (int)_x, (int)floorf(_y), alpha, maxTransparency, drawLinesDirection); //aloha
	}

	quarter = roundf(radiusY2 / sqrtf(radiusX2 + radiusY2));
	for(float _y = 0; _y <= quarter; _y++) {
	    float _x = radiusX * sqrtf(1 - _y * _y / radiusY2);
	    float error = _x - floorf(_x);

	    float transparency = roundf(error * maxTransparency);
	    int alpha = transparency;
	    int alpha2 = maxTransparency - transparency;

	    drawLinesDirection = 0;

	    setPixel4(brush, brushGuide, width, r, r, (int) floorf(_x), (int)_y, alpha, maxTransparency, drawLinesDirection); //alph
	}
	

		//floodFillBrush(brush, width, r, r, maxTransparency, 1);
	}

void computeSquareMask(int width, double alpha, int *brush, int *brushGuide){
	//int r = R - 1;
	int r = R - 1;

	for(int y = 0; y <= r*2; y++){
		for(int x = 0; x <= r*2; x++){
			brush[x + (y*width)] = (uint8_t) 255 * alpha;

			if(x == 0 || x == (r*2) || y == 0 || y == (r*2)){
				brushGuide[x + (y * width)] = 255;
			}
		}
	}
}

double dist(struct point p1, struct point p2){
	return sqrt(((p1.u - p2.u)*(p1.u - p2.u)) + ((p1.v - p2.v)*(p1.v - p2.v)));
}

uint8_t getMask(int item){
	int bitMask = ((1<<8)-1);
	return ((item >> 24) & bitMask);
}

void drawPixel(int xC, int yC, int a, int bW, int *buffer){
	if(xC < WIDTH && yC < HEIGHT && xC > 0 && yC > 0){
		int off = xC + yC*bW;
		int current = buffer[off];

		if(current == 0 || current < a){
			buffer[off] = a;
		}
	}
}

void drawMask(double su, double sv, int bW, int *buffer, int rW, int *brush){
	int xC = floor(su);
	int yC = floor(sv);

	int r = R * 2;
	for(int i = 0; i < r; i++){
		for(int j = 0; j < r; j++){
			drawPixel(xC + i, yC + j, brush[i + j*rW], bW, buffer);
		}
	}
}

//private methods
void computeAndInfill(struct point p1, struct point p2, double step, int bW, int *buffer, int rW, int *brush){
	double mag = dist(p1, p2);

	double v1 = (p2.u - p1.u) / mag;
	double v2 = (p2.v - p1.v) / mag;

	for(double t = 0; t < mag; t += step){
		double su = p1.u + (t * v1);
		double sv = p1.v + (t * v2);

		drawMask(su, sv, bW, buffer, rW, brush);
	}
}

void drawBuffer(int bW, int *buffer){
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int off = (i * WIDTH + j);
			
			if(buffer[off] == 0){
				continue;
			}
	
			uint8_t newRed = RED;
			uint8_t newGreen = GREEN;
			uint8_t newBlue = BLUE;
			uint8_t newA = (uint8_t) buffer[off]; 

			uint32_t oldColor = alphaMask[off];
			int bitMask = ((1<<8)-1);
			uint8_t oldA = (oldColor >> 24) & bitMask;

			uint32_t newColor = (newA << 24) | (newBlue << 16) | (newGreen << 8) | newRed;

			//edge case: blending eraser
			if(eraseMode == 1 && newA != 255){
				newColor = (newA << 24) | (255 << 16) | (255 << 8) | 255;
			}

			//think that this might be the issue
			//old color isn't alphaMask[off]
			newColor = AlphaBlendPixels(oldColor, newColor);

			//blend eraser
			if(eraseMode == 1 && newA == 255){
				newColor = 0x00000000;
			}

			layersPtr[cL][off] = newColor;

		}
	}
}

void setLayerColor(int layer, int color){
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int off = (i * WIDTH + j);

			layersPtr[layer][off] = color;
			alphaMask[off] = color;
		}
	}
}

void clearScreen(){
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int off = (i * WIDTH + j);

			screen[off] = 0xffffffff;
			layersPtr[cL][off] = 0xffffffff;

			alphaMask[off] = 0xffffffff;
			buffer[off] = 0;
			overlay[off] = 0;
		}
	}
}

void clearLayer(int layer){
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int off = (i * WIDTH + j);

			layersPtr[layer][off] = (0 << 24) | (0 << 16) | (0 << 8) | 0;
			alphaMask[off] = (0 << 24) | (0 << 16) | (0 << 8) | 0;
		}
	}
}

void clearCurrentLayer(){
	clearLayer(cL);
	if(cL == 0){
		setLayerColor(cL, 0xffffffff);
	}
}

void clearBrushes(){
	for(int i = 0; i < R * 2; i++){
		for(int j = 0; j < R * 2; j++){
			brush[i + j*(2 * R)] = 0;
			brushGuide[i + j*(2 * R)] = 0;
		}
	}
}

void clearOverlay(){
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int off = (i * WIDTH + j);
			overlay[off] = 0;
		}
	}
}

void startPath(int pX, int pY){
	pA.u = pX - R;
	pA.v = pY - R;

	//compute and infill
	drawMask(pA.u, pA.v, WIDTH, buffer, R*2, brush);
	drawBuffer(WIDTH, buffer);

	return;
}

void addPoint(int pX, int pY){
	pB = pA;

	pA.u = pX - R;
	pA.v = pY - R;

	computeAndInfill(pA, pB, 0.1, WIDTH, buffer, R*2, brush);
	drawBuffer(WIDTH, buffer);
}

void endPath(){
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int off = (i * WIDTH + j);
			
			if(buffer[off] == 0){
				continue;
			}
						
			//alphaMask[off] = ptr[off];
			alphaMask[off] = layersPtr[cL][off];
			buffer[off] = 0;
		}
	}
}


void setBrushProperties(int rin, int mode, int alpha, int setEraseMode){
	R = rin;

	//this is really ugly, need to fix to use floats later
	double a = alpha / 255.0;

	clearOverlay();

	int nbr = (2 * R) * (2 * R);
	brush = (int*)malloc(nbr * sizeof(int));
	brushGuide = (int*)malloc(nbr * sizeof(int));
	clearBrushes();

	if(mode == 0){
		computeAACircleMask(R*2, a, brush, brushGuide);
	}

	if(mode == 1){
		computeSquareMask(R*2, a, brush, brushGuide); //square mask
	}

	eraseMode = setEraseMode;
}

void setOverlay(int x, int y){
	int r = R * 2;

	x = x - R;
	y = y - R;

	for(int i = 0; i < r; i++){
		for(int j = 0; j < r; j++){
			if(i+oldx > 0 && i+oldx < WIDTH && j+oldy > 0 && j+oldy < HEIGHT){
				int off = (oldx+i) + (oldy+j)*WIDTH;

				overlay[off] = 0;
			}
		}
	}

	for(int i = 0; i < r; i++){
		for(int j = 0; j < r; j++){
			drawPixel(x + i, y + j, brushGuide[i + j*r], WIDTH, overlay);
		}
	}

	oldx = x;
	oldy = y;
}

void blendLayers(){
	for(int layer = 0; layer < maxLayers; layer++){
		//skip all hidden and uncreated layers
		if(layers[layer] != 0x02) { continue; }

		for(int i = 0; i < WIDTH; i++){
			for(int j = 0; j < HEIGHT; j++){
				int idx = i + j*WIDTH;

				uint32_t oldColor = screen[idx];
				uint32_t newColor = layersPtr[layer][idx];


				screen[idx] = AlphaBlendPixels(oldColor, newColor);
			}
		}
	}
	
	//blend the overlay on top
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int idx = i + j*WIDTH;

			if(overlay[idx] != 0){
				screen[idx] = (overlay[idx] << 24) | (0 << 16) | (0 << 8) | 0;
			}
		}
	}
}

void setColor(int red, int green, int blue){
	RED = red;
	GREEN = green;
	BLUE = blue;
}

//add a layer to the top of the stack
void addLayer(){
	if(layerCount + 1 < maxLayers){
		layerCount++;					//increment layer counter
		layers[layerCount] = 0x02; 		//set current layer as visible
	}
}

//select given layer for drawing
void selectActiveLayer(int layer){
	if(layers[layer] == 0x02){
		cL = layer;
	}
}

//remove current layer from system
void removeLayer(int layer){
	layers[layer] = 0; //"hide" for now
}

//set layer as visible or invisible
void toggleLayerVisibility(int layer){
	int status = layers[layer];
	if(status == 1){
		layers[layer] = 2;
	} else if (status == 2){
		layers[layer] = 1;
	}
}

uint8_t* layerArrayAddress(){
	return layers;
}

void initSystem(){
	R = 5;

	int nbr = (2 * R) * (2 * R);
	brush = (int*)malloc(nbr * sizeof(int));
	brushGuide = (int*)malloc(nbr * sizeof(int));
	clearBrushes();

	int nb = WIDTH * HEIGHT;
	buffer = (int*)malloc(nb * sizeof(int));
	alphaMask = (int*)malloc(nb * sizeof(int));
	overlay = (int*)malloc(nb * sizeof(int));
	ptr = (int*)malloc(nb * sizeof(int));

	computeAACircleMask(R*2, 1.0, brush, brushGuide);

	//preallocate all layers for now...this is ugly. Clean up later!
	//"don't malloc in a for loop"
	layersPtr[0] = (int*)malloc(nb * sizeof(int));
	layersPtr[1] = (int*)malloc(nb * sizeof(int));
	layersPtr[2] = (int*)malloc(nb * sizeof(int));
	layersPtr[3] = (int*)malloc(nb * sizeof(int));
	layersPtr[4] = (int*)malloc(nb * sizeof(int));
	layersPtr[5] = (int*)malloc(nb * sizeof(int));
	layersPtr[6] = (int*)malloc(nb * sizeof(int));
	layersPtr[7] = (int*)malloc(nb * sizeof(int));
	layersPtr[8] = (int*)malloc(nb * sizeof(int));
	layersPtr[9] = (int*)malloc(nb * sizeof(int));

	clearScreen();

	//layers api
	cL = 0; 		//set current selected layer
	layerCount = 0;	//define first layer as OK
	layers[cL] = 0x02;		//set current layer as visible

	//clear current layer
	setLayerColor(cL, 0xffffffff);
	selectActiveLayer(cL);
}

//free all shared memory
void dealloc(){
	free(buffer);
	free(alphaMask);
	free(overlay);
	free(ptr);
	free(layersPtr);
}