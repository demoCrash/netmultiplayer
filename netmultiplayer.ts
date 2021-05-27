// Add your code here

enum RoomState {
    //% block="room creating"
    Creating,
    //% block="room created"
    Created
}

enum EnterRoomState {
    //% block="entering"
    Entering,
    //% block="entered"
    Entered
}

//% weight=78
//% icon="\uf0c0" color="#00CCCC"
//% advanced=true
namespace netmultiplayer {
    export class Socket {
        private static instance: Socket;
        protected dev: serial.Serial;
        protected esp32Ready:boolean;
        protected createRoomStep:number;
        protected joinRoomStep:number;
        protected isHost:boolean;
        public messageListener: (pkt: Buffer) => void;
        private _id: number;

        protected enableEsp32(enable:boolean) {
            const cs = pins.pinByCfg(DAL.CFG_PIN_WIFI_CS)
            if (cs) {
                cs.digitalWrite(enable);
            }
        }

        constructor() {
            this.esp32Ready = false
            this.createRoomStep = -1
            this.joinRoomStep = -1
            this.isHost = false
            this._id = control.allocateNotifyEvent();
        }

        public static getInstance() {
            if (!Socket.instance) Socket.instance = new Socket();
            return Socket.instance;
        }
        setupSerialSevice() {
            const rx = pins.pinByCfg(DAL.CFG_PIN_WIFI_AT_RX);
            const tx = pins.pinByCfg(DAL.CFG_PIN_WIFI_AT_TX);
            this.dev = serial.createSerial(tx,rx,DAL.DEVICE_ID_SERIAL);    
            this.dev.serialDevice.setTxBufferSize(256);
            this.dev.serialDevice.setRxBufferSize(512);
            //this.dev.serialDevice.setBaudRate(BaudRate.BaudRate115200);
            this.dev.serialDevice.onEvent(SerialEvent.DataReceived, function () {
                if(!this.esp32Ready) {
                    let recv = this.dev.readString() as String
                    if(recv.includes("ready")) {
                        this.esp32Ready = true
                        console.log("esp32Ready")
                        if(this.createRoomStep == 0) {
                            this.dev.writeString("AT+CWMODE=3\r\n");
                            control.raiseEvent(RoomState.Creating, this._id)
                        } else if(this.joinRoomStep == 0) {
                            this.dev.writeString("AT+CWMODE=1\r\n");
                            control.raiseEvent(EnterRoomState.Entering, this._id)
                        }
                    }
                } else {
                    if(this.isHost) {
                        if(this.createRoomStep == 0 || this.createRoomStep == 1
                        || this.createRoomStep == 2 || this.createRoomStep == 3|| this.createRoomStep == 4) {
                            let recv = this.dev.readString() as String
                            if(recv.includes("OK")) {
                                console.log("roostep" + this.createRoomStep + " Ok")
                                if(this.createRoomStep == 0) {
                                    this.createRoomStep = 1
                                    this.dev.writeString("AT+CWSAP=\"XtronPro_Muti\",\"12345678\",5,3\r\n");
                                } else if(this.createRoomStep == 1) {
                                    this.createRoomStep = 2
                                    this.dev.writeString("AT+CIPSTART=\"UDP\",\"192.168.4.2\",8080,8080,0\r\n");
                                } else if(this.createRoomStep == 2) {
                                    this.createRoomStep = 3
                                    this.dev.writeString("AT+CIPMODE=1\r\n");
                                } else if(this.createRoomStep == 3) {
                                    this.createRoomStep = 4
                                    this.dev.writeString("AT+CIPSEND\r\n");
                                } else if(this.createRoomStep == 4) {
                                    this.createRoomStep = 5
                                    console.log("room created")
                                    control.raiseEvent(RoomState.Created, this._id)
                                }
                            }
                        } else {
                        if(this.createRoomStep == 5) {
                            //wait udp data callback
                            let buf = this.dev.readBuffer()
                            if (this.messageListener) this.messageListener(buf);
                        }
                    }
                    } else {
                        if(this.joinRoomStep == 0 || this.joinRoomStep == 1
                        || this.joinRoomStep == 2|| this.joinRoomStep == 3|| this.joinRoomStep == 4) {
                            let recv = this.dev.readString() as String
                            if(recv.includes("OK")) {
                                console.log("joinstep" + this.joinRoomStep + " Ok")
                                if(this.joinRoomStep == 0) {
                                    this.joinRoomStep = 1
                                    this.dev.writeString("AT+CWJAP=\"XtronPro_Muti\",\"12345678\"\r\n");
                                } else if(this.joinRoomStep == 1) {
                                    this.joinRoomStep = 2
                                    this.dev.writeString("AT+CIPSTART=\"UDP\",\"192.168.4.1\",8080,8080,0\r\n");
                                } else if(this.joinRoomStep == 2) {
                                    this.joinRoomStep = 3
                                    this.dev.writeString("AT+CIPMODE=1\r\n");
                                }else if(this.joinRoomStep == 3) {
                                    this.joinRoomStep = 4
                                    this.dev.writeString("AT+CIPSEND\r\n")
                                } else if(this.joinRoomStep == 4) {
                                    console.log("join room success")
                                    this.joinRoomStep = 5
                                    control.raiseEvent(EnterRoomState.Entered, this._id)
                                }
                            } 
        
                        } else {
                            if(this.joinRoomStep == 5) {
                                //wait udp data callback
                                let buf = this.dev.readBuffer()
                                if (this.messageListener) this.messageListener(buf);
                            }
                        }
                    }
                }
            })
        }

        createServer() {
            this.isHost = true
            this.createRoomStep = 0
            this.enableEsp32(true)
        }

        createClient() {
            this.joinRoomStep = 0
            this.enableEsp32(true)
        }

        onRoomStateEvent(state: RoomState, handler: () => void) {
            control.onEvent(state, this._id, handler);
        }

        onEnterRoomStateEvent(state: EnterRoomState, handler: () => void) {
            control.onEvent(state, this._id, handler);
        }

        // onMessage(handler: (pkt: Buffer) => void) {
        //     this.messageListener = handler;
        // }

        sendPacket(pkt:Buffer) {
            this.dev.writeBuffer(pkt)
        } 
    }

    //% blockId=netmultiplayer_start_service block="netmultiplayer service start"
    //% weight=90
    export function startService() {
        const socket = netmultiplayer.Socket.getInstance();
        socket.setupSerialSevice()
    }

    //% blockId=netmultiplayer_start_server block="netmultiplayer create server"
    //% weight=80
    export function startAsServer() {
        const socket = netmultiplayer.Socket.getInstance();
        socket.createServer()
    }

    //% blockId=netmultiplayer_start_client block="netmultiplayer create client"
    //% weight=80
    export function startAsClient() {
        const socket = netmultiplayer.Socket.getInstance();
        socket.createClient()
    }

    //% blockId=netmultiplayer_send_message block="send packet %data"
    //% weight=77 
    export function sendPacket(data:Buffer) {
        const socket = netmultiplayer.Socket.getInstance();
        socket.sendPacket(data)
    }

    //% blockId=netmultiplayer_on_receive_message block="on received message"
    //% weight=10 draggableParameters=reporter
    export function onReceivedMessage(handler: (pkt: Buffer) => void) {
        const socket = netmultiplayer.Socket.getInstance();
        socket.messageListener = handler
    }

    //% blockId=nethostonstate block="on host state update %state"
    //% weight=10
    export function onHostStateUpdate(state:RoomState,handler: () => void) {
        const socket = netmultiplayer.Socket.getInstance();
        socket.onRoomStateEvent(state, handler)
    }

    //% blockId=netslaveonstate block="on slave state update %state"
    //% weight=10
    export function onSlaveStateUpdate(state:EnterRoomState,handler: () => void) {
        const socket = netmultiplayer.Socket.getInstance();
        socket.onEnterRoomStateEvent(state, handler)
    }
}