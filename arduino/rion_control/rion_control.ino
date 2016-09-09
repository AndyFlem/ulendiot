//////////////////////////////////////////
//Pump comtroller
//////////////////////////////////////////
#define V1CAL 265.8

#define I1CAL 15.4//14.4 // calculated value is 100A:0.05A for transformer / 18 Ohms for resistor = 111.1

#define I1LEAD -5 // number of microseconds the CT1 input leads the voltage input by
#define POWERCORRECTION 0 // this value, in watts, may be used to compensate for the leakage from voltage to current inputs

// other system constants
#define SUPPLY_VOLTS 5.0 // used here because it's more accurate than the internal band-gap reference
#define SUPPLY_FREQUENCY 50
#define NUMSAMPLES 90 // number of times to sample each 50Hz cycle

#define FILTERSHIFT 13 // for low pass filters to determine ADC offsets
#define PLLTIMERRANGE 250 //100 // PLL timer range limit ~+/-0.5Hz
#define PLLLOCKRANGE 40 // allowable ADC range to enter locked state
#define PLLUNLOCKRANGE 80 // allowable ADC range to remain locked
#define PLLLOCKCOUNT 100 // number of cycles to determine if PLL is locked
#define LOOPTIME 1000 // time of outer loop in milliseconds, also time between radio transmissions

//--------------------------------------------------------------------------------------------------
// constants calculated at compile time
#define V1_RATIO ((V1CAL * SUPPLY_VOLTS)/1024)

#define I1_RATIO ((I1CAL * SUPPLY_VOLTS)/1024)

#define I1PHASESHIFT (((I1LEAD+36)*256)/400) // phase shift in voltage to align to current samples

#define FILTERROUNDING (1<<(FILTERSHIFT-1))
#define TIMERTOP (((20000/NUMSAMPLES)*16)-1) // terminal count for PLL timer
#define PLLTIMERMAX (TIMERTOP+PLLTIMERRANGE)
#define PLLTIMERMIN (TIMERTOP-PLLTIMERRANGE)

//ANALOG PINS
#define VOLTS1PIN 0
#define CT1PIN 2

//DIGITAL PIINS
#define ACTIVITYPIN 2
#define PINLOCK 4

#define CONTACTOR_NO 6
#define CONTACTOR_NC 7

long relay_interval=750; //time relays are held open or closed for contactor to latch
unsigned long relay_off_time;
int NO=LOW;
int NC=LOW;

boolean activity;
int sampleV1;
int sampleI1;
int numSamples;

int volts1Offset=512;
int I1Offset=512;

float V1rms;
float I1rms;
long sumV1squared;
long sumI1squared;
long sumP1;

long cycleV1squared;
long cycleI1squared;
long cycleP1;
long totalV1squared;
long totalI1squared;
long totalP1;
long sumTimerCount;

float realPower1,apparentPower1,powerFactor1;
long energy1;

float frequency;
word timerCount=TIMERTOP;
word pllUnlocked=PLLLOCKCOUNT;
word cycleCount;
boolean newCycle;
unsigned long nextTransmitTime;

void setup()
{
  delay(200); 

  Serial.begin(19200);

  pinMode(CONTACTOR_NO,OUTPUT);
  pinMode(CONTACTOR_NC,OUTPUT);


  pinMode(PINLOCK,OUTPUT);
  pinMode(ACTIVITYPIN,OUTPUT);

  // change ADC prescaler to /64 = 250kHz clock
  // slightly out of spec of 200kHz but should be OK
  const unsigned char PS_32=(1<<ADPS2)|(1<<ADPS0);
  const unsigned char PS_64=(1<<ADPS2)|(1<<ADPS1);
  const unsigned char PS_128=(1<<ADPS2)|(1<<ADPS1)|(1<<ADPS0);
  //ADCSRA &= 0xf8;  // remove bits set by Arduino library
  //ADCSRA |= 0x06; 
  ADCSRA &= ~PS_128;
  ADCSRA |= PS_64;

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
  
  delay(1500);  
  interrupts();  
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
  
  //COMMANDS
  int i=0;
  char commandBuffer[20];
  String cmd;
  char* sep;
  
  if (Serial.available()){
    delay(25);
    while(Serial.available() && i<19) {
      commandBuffer[i++] = Serial.read();
    }
    commandBuffer[i++]='\0';
  }
  if (i>0) {
    if (strcmp(commandBuffer,"PUMP_ON")==0) {
      relay_off_time=millis()+relay_interval;
      digitalWrite(CONTACTOR_NO,HIGH);
      NO=HIGH;
    }
    if (strcmp(commandBuffer,"PUMP_OFF")==0) {
        relay_off_time=millis()+relay_interval;
        digitalWrite(CONTACTOR_NC,HIGH);    
        NC=HIGH;
    }
  }
  if (NO==HIGH && millis()>relay_off_time){
    NO=LOW;
    digitalWrite(CONTACTOR_NO,LOW);    
  }
  if (NC==HIGH && millis()>relay_off_time){
    NC=LOW;
    digitalWrite(CONTACTOR_NC,LOW);    
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
  static int newV1;
  static int newI1;
  static int lastV1;
  static long fVolts1Offset=512L<<FILTERSHIFT;
  static long fI1Offset=512L<<FILTERSHIFT;
  int result;
  long phaseShiftedV1;

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
  case CT1PIN:
    sampleI1 = result;
    newI1=sampleI1-I1Offset;
    sumI1squared+=((long)newI1*newI1);
    fI1Offset += (sampleI1-I1Offset);
    I1Offset=(int)((fI1Offset+FILTERROUNDING)>>FILTERSHIFT);
    updatePLL(newV1,lastV1);
    break;
  }

}

void updatePLL(int newV, int lastV)
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
    }
    else // in the falling part of the cycle, we shouldn't be here
    {
      OCR1A=PLLTIMERMAX; // shift out of this region fast
      pllUnlocked=PLLLOCKCOUNT; // and we can't be locked
    }

    oldV=newV;

    // save results for outer loop
    cycleV1squared=sumV1squared;
    cycleI1squared=sumI1squared;
    cycleP1=sumP1;

    // and clear accumulators
    sumV1squared=0;
    sumI1squared=0;
    sumP1=0;

    newCycle=true; // flag new cycle to outer loop
  }
}

// add data for new 50Hz cycle to total
void addCycle()
{
  totalV1squared+=cycleV1squared;

  totalI1squared+=cycleI1squared;

  totalP1+=cycleP1;

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

  I1rms = I1_RATIO * sqrt(((float)totalI1squared)/numSamples); 

  realPower1 = (V1_RATIO * I1_RATIO * (float)totalP1)/numSamples;
  if(abs(realPower1)>POWERCORRECTION) realPower1-=POWERCORRECTION;
  apparentPower1 = V1rms * I1rms;
  powerFactor1=realPower1 / apparentPower1;

  frequency=((float)cycleCount*16000000)/(((float)sumTimerCount)*NUMSAMPLES);

  energy1=(realPower1*LOOPTIME)/1000; //watt-seconds

  totalV1squared=0;
  totalI1squared=0;
  totalP1=0;
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
  }
  else{
    digitalWrite(PINLOCK,HIGH);
  }

  if (I1rms<0.1) {
    I1rms=0;realPower1=0;apparentPower1=0;powerFactor1=1;energy1=0;
  }
  if (V1rms<10) {
    V1rms=0;I1rms=0;realPower1=0;apparentPower1=0;powerFactor1=1;energy1=0;
  }


  Serial.print("CON,");  //0
  Serial.print(V1rms,1); //1
  Serial.print(",");
  Serial.print(I1rms);//2
  Serial.print(",");
  Serial.print(realPower1,0);//3
  Serial.print(",");  
  Serial.print(apparentPower1,0);//4
  Serial.print(",");  
  Serial.print(powerFactor1,2);//5
  Serial.print(",");
  Serial.print(energy1);//6
  Serial.print(",");
  Serial.print(frequency);//7
  Serial.print(",");
  if (pllUnlocked) {
    Serial.print("U"); //8
  } else
  {
    Serial.print("L"); //8
  }  
  Serial.println();
  
}



