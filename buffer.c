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
int layers[10];
int* visibleLayers;

int cL; 		//layer number we are drawing on
int numLayers;	//number of layers at the moment

int* layersPtr; //array containing layer data


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

void dealloc(){
	free(ptr);
}

void computeCircleMask(int width, double alpha, int *brush, int *brushGuide){
	//brush engine2 below:
	//int r = R - 1;
	int r = R - 1;

	for(int y = -r; y <= r; y++){
		for(int x = -r; x <= r; x++){
			//calculate offset
			int realx = x + r;
			int realy = y + r;

			if(realx < 0 || realy < 0) continue;

			//fill in mask
			if(x*x+y*y <= r*r + r * 0.8f){
				int deltaX = r - realx;
				int deltaY = r - realy;

				double distance = sqrt(deltaX * deltaX + deltaY * deltaY);
				int color = (int) 255.0 * ((double)r - distance);

				if(color < 0 ) color = 0;
				if(color > 255) color = 255;

				brush[realx + (realy*width)] = (uint8_t) color * alpha;
			}

			//fill in guide mask
			if((x*x+y*y < r*r + r *0.8f) && (x*x+y*y > r*r - r)){
				brushGuide[realx + (realy*width)] = 255;
			}
		}    
	}
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

			int oldColor = alphaMask[off];
			int bitMask = ((1<<8)-1);
			uint8_t oldA = (oldColor >> 24) & bitMask;

			uint32_t newColor = (newA << 24) | (newBlue << 16) | (newGreen << 8) | newRed;

			//edge case: blending eraser
			if(eraseMode == 1 && newA != 255){
				newColor = (newA << 24) | (255 << 16) | (255 << 8) | 255;
			}

			newColor = AlphaBlendPixels(oldColor, newColor);

			if(eraseMode == 1 && newA == 255){
				newColor = 0x00000000;
			}

			ptr[off] = newColor;

		}
	}
}

void clearScreen(){
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int off = (i * WIDTH + j);

			alphaMask[off] = (255 << 24) | (255 << 16) | (255 << 8) | 255;
			buffer[off] = 0;
			overlay[off] = 0;

			ptr[off] = (255 << 24) | (255 << 16) | (255 << 8) | 255;
		}
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
	clearScreen();

	computeCircleMask(R*2, 1.0, brush, brushGuide);
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
						
			alphaMask[off] = ptr[off];
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
		computeCircleMask(R*2, a, brush, brushGuide); //circle mask
	}

	if(mode == 1){
		computeSquareMask(R*2, a, brush, brushGuide); //square mask
	}

	eraseMode = setEraseMode;


}


int oldx = -1;
int oldy = -1;

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
	for(int i = 0; i < WIDTH; i++){
		for(int j = 0; j < HEIGHT; j++){
			int idx = i + j*WIDTH;

			screen[idx] = ptr[idx];

			if(overlay[idx] == 255){
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

//layers API below: (draft of what it would look like)

//1.0 MVP--------------------------------------------

/*
//add a layer to the top of the stack
void addLayer(){
	numLayers++;
	layers[numLayers] = numLayers;
	visibleLayers[numLayers] = 1;
}

//select given layer for drawing
void selectActiveLayer(int layer){
	if(visibleLayers[layer] == 1){
		activeLayer = layer;
	}
}

//remove current layer from system
void removeLayer(int layer){

}

//set layer as visible or invisible
void toggleLayerVisibility(int layer){
	int status = visibleLayers[layer];
	if(status == 0){
		visibleLayers[layer] = 1;
	} else {
		visibleLayers[layer] = 0;
	}
}

//list of layers can be grabbed in JS side of things!

//2.0---------------------

//set order of layers
void setLayerOrder(){

}
*/