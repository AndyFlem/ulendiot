//////////////////////////////////////////
//Three phase monitor
//////////////////////////////////////////
#define V1CAL 267.2//248.9
#define V2CAL 270.3//251.8
#define V3CAL 269.6//249.6

#define I1CAL 55.5 // calculated value is 100A:0.05A for transformer / 18 Ohms for resistor = 111.1
#define I2CAL 55.5//58.7
#define I3CAL 55.5

#define I1LEAD -5 // number of microseconds the CT1 input leads the voltage input by
#define I2LEAD -5 // number of microseconds the CT2 input leads the voltage input by
#define I3LEAD -5 // number of microseconds the CT2 input leads the voltage input by
#define POWERCORRECTION 0 // this value, in watts, may be used to compensate for the leakage from voltage to current inputs

// other system constants
#define SUPPLY_VOLTS 5 // used here because it's more accurate than the internal band-gap reference
#define SUPPLY_FREQUENCY 50
#define NUMSAMPLES 35 // number of times to sample each 50Hz cycle

#define FILTERSHIFT 13 // for low pass filters to determine ADC offsets
#define PLLTIMERRANGE 250 //100 // PLL timer range limit ~+/-0.5Hz
#define PLLLOCKRANGE 40 // allowable ADC range to enter locked state
#define PLLUNLOCKRANGE 80 // allowable ADC range to remain locked
#define PLLLOCKCOUNT 100 // number of cycles to determine if PLL is locked
#define LOOPTIME 1000 // time of outer loop in milliseconds, also time between radio transmissions

//--------------------------------------------------------------------------------------------------
// constants calculated at compile time
#define V1_RATIO ((V1CAL * SUPPLY_VOLTS)/1024)
#define V2_RATIO ((V2CAL * SUPPLY_VOLTS)/1024)
#define V3_RATIO ((V3CAL * SUPPLY_VOLTS)/1024)

#define I1_RATIO ((I1CAL * SUPPLY_VOLTS)/1024)
#define I2_RATIO ((I2CAL * SUPPLY_VOLTS)/1024)
#define I3_RATIO ((I3CAL * SUPPLY_VOLTS)/1024)

#define I1PHASESHIFT (((I1LEAD+36)*256)/400) // phase shift in voltage to align to current samples
#define I2PHASESHIFT (((I2LEAD+36)*256)/400)
#define I3PHASESHIFT (((I3LEAD+36)*256)/400)

#define FILTERROUNDING (1<<(FILTERSHIFT-1))
#define TIMERTOP (((20000/NUMSAMPLES)*16)-1) // terminal count for PLL timer
#define PLLTIMERMAX (TIMERTOP+PLLTIMERRANGE)
#define PLLTIMERMIN (TIMERTOP-PLLTIMERRANGE)

// Arduino I/O pin useage
#define VOLTS1PIN 0
#define VOLTS2PIN 1
#define VOLTS3PIN 2
#define CT1PIN 5
#define CT2PIN 4
#define CT3PIN 3

//DIGITAL PIINS
#define ACTIVITYPIN 2
#define PINLOCK 3
#define PINL1 4
#define PINL2 5
#define PINL3 6
//#define FAULTPIN 7
//#define EXTERNAL_FAULT 8

//boolean fault=false;
//int l1_state=0; //0=down, 1=low v, 2=high v, 3=normal
//int l2_state=0;
//int l3_state=0;

boolean activity;

int sampleV1,sampleV2,sampleV3;
int sampleI1,sampleI2,sampleI3;
int numSamples;

int volts1Offset=512,volts2Offset=512,volts3Offset=512;
int I1Offset=512,I2Offset=512,I3Offset=512; // start offsets at ADC centre

float V1rms,V2rms,V3rms;
float I1rms,I2rms,I3rms;
long sumV1squared,sumV2squared,sumV3squared;
long sumI1squared,sumI2squared,sumI3squared;
long sumP1,sumP2,sumP3;

long cycleV1squared,cycleV2squared,cycleV3squared;
long cycleI1squared,cycleI2squared,cycleI3squared;
long cycleP1,cycleP2,cycleP3;
long totalV1squared,totalV2squared,totalV3squared;
long totalI1squared,totalI2squared,totalI3squared;
long totalP1,totalP2,totalP3;
long sumTimerCount;

float realPower1,apparentPower1,powerFactor1;
float realPower2,apparentPower2,powerFactor2;
float realPower3,apparentPower3,powerFactor3;
long energy1,energy2,energy3;

float frequency;
word timerCount=TIMERTOP;
word pllUnlocked=PLLLOCKCOUNT;
word cycleCount;
boolean newCycle;

unsigned long nextTransmitTime;

//long phase_distance;
//boolean bridged=false;

void setup()
{
  delay(200); 
  
  Serial.begin(19200);

  pinMode(PINLOCK,OUTPUT);
//  pinMode(PINL1,OUTPUT);
//  pinMode(PINL2,OUTPUT);
//  pinMode(PINL3,OUTPUT);
//  pinMode(FAULTPIN,OUTPUT);
  pinMode(ACTIVITYPIN,OUTPUT);
//  pinMode(EXTERNAL_FAULT,OUTPUT);

  // change ADC prescaler to /32 = 500 kHz clock
  // slightly out of spec of 200kHz but should be OK
  const unsigned char PS_16=(1<<ADPS2);
  const unsigned char PS_32=(1<<ADPS2)|(1<<ADPS0);
  const unsigned char PS_64=(1<<ADPS2)|(1<<ADPS1);
  const unsigned char PS_128=(1<<ADPS2)|(1<<ADPS1)|(1<<ADPS0);
  //ADCSRA &= 0xf8;  // remove bits set by Arduino library
  //ADCSRA |= 0x06; 
  ADCSRA &= ~PS_128;
  ADCSRA |= PS_32;

  //set timer 1 interrupt for required period
  noInterrupts();
  TCCR1A = 0; // clear control registers
  TCCR1B = 0;
  TCNT1  = 0; // clear counter
  OCR1A = TIMERTOP; // set compare reg for timer period
  bitSet(TCCR1B,WGM12); // CTC mode
  bitSet(TCCR1B,CS10); // no prescaling
  bitSet(TIMSK1,OCIE1A); // enable timer 1 compare interrupt
  bitSet(ADCSRA,ADIE); // enable ADC interrupt
  interrupts();

  //Serial.println("MON_MSG,STARTED,");
}

void loop()
{
  if(newCycle) addCycle(); // a new mains cycle has been sampled

  if((millis()>=nextTransmitTime) && ((millis()-nextTransmitTime)<0x80000000L)) // check for overflow
  {
    calculateVIPF();
    sendResults();
    nextTransmitTime+=LOOPTIME;
  }
}

// timer 1 interrupt handler
ISR(TIMER1_COMPA_vect)
{
  ADMUX = _BV(REFS0) | VOLTS1PIN; // start ADC conversion for voltage
  ADCSRA |= _BV(ADSC);
}

// ADC interrupt handler
ISR(ADC_vect)
{
  static int newV1,newV2,newV3;
  static int newI1,newI2,newI3;
  static int lastV1,lastV2,lastV3;
  static long fVolts1Offset=512L<<FILTERSHIFT,fVolts2Offset=512L<<FILTERSHIFT,fVolts3Offset=512L<<FILTERSHIFT;
  static long fI1Offset=512L<<FILTERSHIFT,fI2Offset=512L<<FILTERSHIFT,fI3Offset=512L<<FILTERSHIFT;
  int result;
  long phaseShiftedV1,phaseShiftedV2,phaseShiftedV3;
  
  result = ADCL;
  result |= ADCH<<8;

  // determine which conversion just completed
  switch(ADMUX & 0x0f)
  {
    case VOLTS1PIN:
      ADMUX = _BV(REFS0) | CT1PIN; // start CT1 conversion
      ADCSRA |= _BV(ADSC);
      lastV1=newV1;
      sampleV1 = result;
      newV1=sampleV1-volts1Offset;
      sumV1squared+=((long)newV1*newV1);
      // update low-pass filter for DC offset
      fVolts1Offset += (sampleV1-volts1Offset); 
      volts1Offset=(int)((fVolts1Offset+FILTERROUNDING)>>FILTERSHIFT);
      // determine voltage at current sampling points and use it for power calculation
      phaseShiftedV1=lastV1+((((long)newV1-lastV1)*I1PHASESHIFT)>>8);
      sumP1+=(phaseShiftedV1*newI1);
      break;
    case VOLTS2PIN:
      ADMUX = _BV(REFS0) | CT2PIN; // start CT1 conversion
      ADCSRA |= _BV(ADSC);
      lastV2=newV2;
      sampleV2 = result;
      newV2=sampleV2-volts2Offset;
      sumV2squared+=((long)newV2*newV2);
      // update low-pass filter for DC offset
      fVolts2Offset += (sampleV2-volts2Offset); 
      volts2Offset=(int)((fVolts2Offset+FILTERROUNDING)>>FILTERSHIFT);
      // determine voltage at current sampling points and use it for power calculation
      phaseShiftedV2=lastV2+((((long)newV2-lastV2)*I2PHASESHIFT)>>8);
      sumP2+=(phaseShiftedV2*newI2);
      break;
    case VOLTS3PIN:
      ADMUX = _BV(REFS0) | CT3PIN; // start CT1 conversion
      ADCSRA |= _BV(ADSC);
      lastV3=newV3;
      sampleV3 = result;
      newV3=sampleV3-volts3Offset;
      sumV3squared+=((long)newV3*newV3);
      // update low-pass filter for DC offset
      fVolts3Offset += (sampleV3-volts3Offset); 
      volts3Offset=(int)((fVolts3Offset+FILTERROUNDING)>>FILTERSHIFT);
      // determine voltage at current sampling points and use it for power calculation
      phaseShiftedV3=lastV3+((((long)newV3-lastV3)*I3PHASESHIFT)>>8);
      sumP3+=(phaseShiftedV3*newI3);
      break;
    case CT1PIN:
      ADMUX = _BV(REFS0) | VOLTS2PIN; // start V2 conversion
      ADCSRA |= _BV(ADSC);
      sampleI1 = result;
      newI1=sampleI1-I1Offset;
      sumI1squared+=((long)newI1*newI1);      
      fI1Offset += (sampleI1-I1Offset); 
      I1Offset=(int)((fI1Offset+FILTERROUNDING)>>FILTERSHIFT);
      break;
    case CT2PIN:
      ADMUX = _BV(REFS0) | VOLTS3PIN; // start V2 conversion
      ADCSRA |= _BV(ADSC);
      sampleI2 = result;
      newI2=sampleI2-I2Offset;
      sumI2squared+=((long)newI2*newI2);
      fI2Offset += (sampleI2-I2Offset); 
      I2Offset=(int)((fI2Offset+FILTERROUNDING)>>FILTERSHIFT);
      break;
    case CT3PIN:
      sampleI3 = result;
      newI3=sampleI3-I3Offset;
      sumI3squared+=((long)newI3*newI3);
      fI3Offset += (sampleI3-I3Offset);
      I3Offset=(int)((fI3Offset+FILTERROUNDING)>>FILTERSHIFT);
      updatePLL(newV1,lastV1,newV2,newV3);
      break;
  }
}

void updatePLL(int newV, int lastV,int newV2, int newV3)
{
  static byte samples=0;
  static int oldV;
  static boolean divertFlag, diverting=false;
  static int manualCycleCount=-1;
  boolean rising;

  rising=(newV>lastV); // synchronise to rising zero crossing

  samples++;
  if(samples>=NUMSAMPLES) // end of one 50Hz cycle
  {    
    samples=0;
    if(rising)
    {
      // if we're in the rising part of the 50Hz cycle adjust the final timer count
      // to move newV towards 0, only adjust if we're moving in the wrong direction
      if(((newV<0)&&(newV<=oldV))||((newV>0)&&(newV>=oldV))) timerCount-=newV;
      // limit range of PLL frequency
      timerCount=constrain(timerCount,PLLTIMERMIN,PLLTIMERMAX);
      OCR1A=timerCount;
      if(abs(newV)>PLLUNLOCKRANGE) pllUnlocked=PLLLOCKCOUNT; // we're unlocked
      else if(pllUnlocked) pllUnlocked--;
      //phase_distance=abs(newV-newV2)+abs(newV-newV3);
    }
    else // in the falling part of the cycle, we shouldn't be here
    {
      OCR1A=PLLTIMERMAX; // shift out of this region fast
      pllUnlocked=PLLLOCKCOUNT; // and we can't be locked
    }
    
    oldV=newV;
    
    // save results for outer loop
    cycleV1squared=sumV1squared;
    cycleV2squared=sumV2squared;
    cycleV3squared=sumV3squared;
    cycleI1squared=sumI1squared;
    cycleI2squared=sumI2squared;
    cycleI3squared=sumI3squared;    
    cycleP1=sumP1;
    cycleP2=sumP2;
    cycleP3=sumP3;    

    // and clear accumulators
    sumV1squared=0;
    sumV2squared=0;
    sumV3squared=0;    
    sumI1squared=0;
    sumI2squared=0;
    sumI3squared=0;    
    sumP1=0;
    sumP2=0;
    sumP3=0;    

    newCycle=true; // flag new cycle to outer loop
  }
}

// add data for new 50Hz cycle to total
void addCycle()
{
     
  totalV1squared+=cycleV1squared;
  totalV2squared+=cycleV2squared;
  totalV3squared+=cycleV3squared;

  totalI1squared+=cycleI1squared;
  totalI2squared+=cycleI2squared;
  totalI3squared+=cycleI3squared;  

  totalP1+=cycleP1;
  totalP2+=cycleP2;
  totalP3+=cycleP3;  

  numSamples+=NUMSAMPLES;
  sumTimerCount+=(timerCount+1); // for average frequency calculation

  cycleCount++;
  newCycle=false;
}

// calculate voltage, current, power and frequency
void calculateVIPF()
{
  if(numSamples==0) return; // just in case
  
  V1rms = V1_RATIO * sqrt(((float)totalV1squared)/numSamples); 
  V2rms = V2_RATIO * sqrt(((float)totalV2squared)/numSamples); 
  V3rms = V3_RATIO * sqrt(((float)totalV3squared)/numSamples);   

  I1rms = I1_RATIO * sqrt(((float)totalI1squared)/numSamples); 
  I2rms = I2_RATIO * sqrt(((float)totalI2squared)/numSamples); 
  I3rms = I3_RATIO * sqrt(((float)totalI3squared)/numSamples);   

  realPower1 = (V1_RATIO * I1_RATIO * (float)totalP1)/numSamples;
  if(abs(realPower1)>POWERCORRECTION) realPower1-=POWERCORRECTION;
  apparentPower1 = V1rms * I1rms;
  powerFactor1=abs(realPower1 / apparentPower1);
  
  realPower2 = V2rms * I2rms;       //(V2_RATIO * I2_RATIO * (float)totalP2)/numSamples;
  if(abs(realPower2)>POWERCORRECTION) realPower2-=POWERCORRECTION;
  apparentPower2 = V2rms * I2rms;
  powerFactor2=abs(realPower2 / apparentPower2);

  realPower3 = (V3_RATIO * I3_RATIO * (float)totalP3)/numSamples;
  if(abs(realPower3)>POWERCORRECTION) realPower3-=POWERCORRECTION;
  apparentPower3 = V3rms * I3rms;
  powerFactor3=abs(realPower3 / apparentPower3);
  
  frequency=((float)cycleCount*16000000)/(((float)sumTimerCount)*NUMSAMPLES);

  energy1=(realPower1*LOOPTIME)/1000; //watt-seconds
  energy2=(realPower2*LOOPTIME)/1000;
  energy3=(realPower3*LOOPTIME)/1000;
  
  totalV1squared=0;
  totalV2squared=0;
  totalV3squared=0;
  totalI1squared=0;
  totalI2squared=0;
  totalI3squared=0;
  totalP1=0;
  totalP2=0;
  totalP3=0;  
  numSamples=0;
  cycleCount=0;
  sumTimerCount=0;
}

void sendResults()
{
  activity=!activity;
  digitalWrite(ACTIVITYPIN,activity);
  
  if(pllUnlocked){ 
    digitalWrite(PINLOCK,LOW);
  }else{
    digitalWrite(PINLOCK,HIGH);
  }
  
  if (I1rms<0.1) {
    I1rms=0;realPower1=0;apparentPower1=0;powerFactor1=0;energy1=0;
  }
  if (I2rms<0.1) {
    I2rms=0;realPower2=0;apparentPower2=0;powerFactor2=0;energy2=0;
  }
  if (I3rms<0.1) {
    I3rms=0;realPower3=0;apparentPower3=0;powerFactor3=0;energy3=0;
  }
  if (V1rms<10.0) {
    V1rms=0;I1rms=0;realPower1=0;apparentPower1=0;powerFactor1=0;energy1=0;
  }
  if (V2rms<10.0) {
    V2rms=0;I2rms=0;realPower2=0;apparentPower2=0;powerFactor2=0;energy2=0;
  }
  if (V3rms<10.0) {
    V3rms=0;I3rms=0;realPower3=0;apparentPower3=0;powerFactor3=0;energy3=0;
  }
  if(realPower1<0){realPower1=0;}
  if(realPower2<0){realPower2=0;}
  if(realPower3<0){realPower3=0;}
  
  Serial.print("MON,");
  Serial.print(V1rms,1); //1
  Serial.print(",");
  Serial.print(I1rms); //2
  Serial.print(",");  
  Serial.print(realPower1,0); //3
  Serial.print(",");  
  Serial.print(apparentPower1,0); //4
  Serial.print(",");  
  Serial.print(powerFactor1,2); //5
  Serial.print(",");
  Serial.print(energy1); //6
  Serial.print(",");
  
  Serial.print(V2rms,1); //7
  Serial.print(",");
  Serial.print(I2rms); //8
  Serial.print(",");  
  Serial.print(realPower2,0); //9
  Serial.print(",");  
  Serial.print(apparentPower2,0); //10
  Serial.print(",");  
  Serial.print(powerFactor2,2); //11
  Serial.print(",");    
  Serial.print(energy2); //12
  Serial.print(",");
    
  Serial.print(V3rms,1); //13
  Serial.print(",");
  Serial.print(I3rms); //14
  Serial.print(",");  
  Serial.print(realPower3,0); //15
  Serial.print(",");  
  Serial.print(apparentPower3,0); //16
  Serial.print(",");  
  Serial.print(powerFactor3,2); //17
  Serial.print(",");    
  Serial.print(energy3); //18
  Serial.print(",");
  Serial.print(frequency); //19
  Serial.print(",");
  if (pllUnlocked) {
    Serial.print("U"); //20
  } else
  {
    Serial.print("L"); //20
  }
  
  Serial.println();
}

