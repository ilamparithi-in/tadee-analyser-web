class complex {
    constructor(real, imaginary) {
        this.re = real;
        this.im = imaginary;
    }
    add(other) {
        if (typeof other === 'number') {
            other = new complex(other, 0);
        }
        return new complex(this.re + other.re, this.im + other.im);
    }
    subtract(other) {
        if (typeof other === 'number') {
            other = new complex(other, 0);
        }
        return new complex(this.re - other.re, this.im - other.im);

    }
    multiply(other) {
        if (typeof other === 'number') {
            other = new complex(other, 0);
        }
        const multiply_real = this.re * other.re - this.im * other.im;
        const multiply_im = this.re * other.im + this.im * other.re;
        return new complex(multiply_real, multiply_im);
    }
    divide(other) {
        if (typeof other === 'number') {
            other = new complex(other, 0);
        }
        const denominator = (Math.pow(other.re, 2) + Math.pow(other.im, 2));
        if (denominator === 0) {
            throw new Error('divide by 0 error!');
        }
        const real = (this.re * other.re + this.im * other.im) / denominator;
        const im = (this.im * other.re - this.re * other.im) / denominator;
        return new complex(real, im);
    }
    sqrt() {
        let mod = this.modulus();
        let angle = Math.atan2(this.im, this.re);
        mod = Math.sqrt(mod);
        angle = angle / 2;
        return new complex(mod * Math.cos(angle), mod * Math.sin(angle));
    }
    cosh() {
        const re = Math.cosh(this.re) * Math.cos(this.im);
        const im = Math.sinh(this.re) * Math.sin(this.im);
        return new complex(re, im);
    }
    sinh() {
        const re = Math.sinh(this.re) * Math.cos(this.im);
        const im = Math.cosh(this.re) * Math.sin(this.im);
        return new complex(re, im);

    }
    conjugate() {
        const im = -1 * this.im;
        return new complex(this.re, im);
    }
    modulus() {
        const mod = Math.sqrt(this.re * this.re + this.im * this.im);
        return mod;
    }
    polar() {
        //returns angle in radians not degrees.
        const mod = this.modulus();
        const angle = Math.atan2(this.im, this.re);
        return { r: mod, thetha: angle };
    }
}
const lineParams = {
    strandDiaM: 0.01, scStrands: 7, scSpacingM: 0.04, scCount: 4, symmetric: 1, Dab: 20, Dbc: 24, Dca: 34,
    phaseSpacingM: 23, lineLengthKm: 25, frequency: 50, model: 2, resSCPerKm: 0.1, nomSyskV: 25,
    recvLoadMW: 140, recvPF: 0.8
}
// length of line in km input

export class lineCalculations {
    constructor(lineParams) {
        this.diaStrands = lineParams.strandDiaM;
        this.noOfStrands = lineParams.scStrands;
        this.spacingBwSubConds = lineParams.scSpacingM;
        this.noOfSCperBundle = lineParams.scCount;
        this.symmetry = lineParams.symmetric;   // 1 = symmetrical, 0 = unsymmetrical
        this.Dab = lineParams.Dab;
        this.Dbc = lineParams.Dbc;
        this.Dca = lineParams.Dca;
        this.D = lineParams.phaseSpacingM;
        this.lineLength = lineParams.lineLengthKm;
        this.freq = lineParams.frequency;
        this.model = lineParams.model;           // 0 = short, 1 = nominal pi, 2 = distributed
        this.RperSCperKm = lineParams.resSCPerKm;
        this.Vnom_kV = lineParams.nomSyskV / Math.sqrt(3); //internal conversion to phase. use as is.

        this.loadMW = lineParams.recvLoadMW;
        this.pf = lineParams.recvPF;

    }
    LandCperPhasePerKm() {
        const s = this.noOfStrands;
        const d_s = this.diaStrands;
        const layers = (3 + Math.sqrt(12 * s - 3)) / 6;
        const diam = (2 * layers - 1) * d_s;
        const spacing = this.spacingBwSubConds;
        const r_c = diam / 2;
        const r_l = diam / 2 * 0.7788;
        const noOfSC = this.noOfSCperBundle;
        let SGMDc, SGMDl, MGMD;
        let symmetry = this.symmetry;
        const Dab = this.Dab;
        const Dbc = this.Dbc;
        const Dca = this.Dca;
        const D = this.D;


        if (noOfSC === 2) {
            SGMDc = Math.sqrt(r_c * spacing);
            SGMDl = Math.sqrt(r_l * spacing);
        }
        else if (noOfSC === 3) {
            SGMDc = Math.cbrt(r_c * spacing * spacing);
            SGMDl = Math.cbrt(r_l * spacing * spacing);

        }
        else if (noOfSC === 4) {
            SGMDc = Math.sqrt(Math.sqrt(r_c * spacing * spacing * spacing * Math.sqrt(2)));
            SGMDl = Math.sqrt(Math.sqrt(r_l * spacing * spacing * spacing * Math.sqrt(2)));
        }
        else {
            throw new Error('invalid bundle size!');
        }

        if (symmetry === 1) {
            MGMD = D;
        }
        else if (symmetry === 0) {
            MGMD = Math.cbrt(Dab * Dbc * Dca);
        }
        const c = (2 * Math.PI * 8.85e-12 / Math.log(MGMD / SGMDc)) * 1000;
        const l = (2e-7 * Math.log(MGMD / SGMDl)) * 1000;
        return { inductance: l, capacitance: c };

    }
    XLandXC() {
        const landc = this.LandCperPhasePerKm();
        const l = landc.inductance;
        const c = landc.capacitance;
        const lineLength = this.lineLength;
        const f = this.freq;
        const XL = 2 * Math.PI * f * l * lineLength;
        const XC = 1 / (2 * Math.PI * f * (c * lineLength));
        return { Reactance_L: XL, Reactance_C: XC };
    }
    RperCond() {
        const RperSCperKm = this.RperSCperKm;
        const noOfSC = this.noOfSCperBundle;
        const R = RperSCperKm / noOfSC * this.lineLength;
        return R;
    }
    ABCDparams() {
        const model = this.model;

        const XL = this.XLandXC().Reactance_L;
        const XC = this.XLandXC().Reactance_C;
        if (XC === 0) {
            throw new Error('divide by 0 error!');
        }
        const Y = new complex(0, 1 / XC);
        let A, B, C, D;
        const R = this.RperCond();
        const Z = new complex(R, XL);

        if (model === 0) {
            A = 1;
            B = Z;
            C = 0;

        }
        else if (model === 1) {
            const YZ = Z.multiply(Y);
            const YZdiv2 = YZ.divide(2);
            const YsquareZdiv2 = YZdiv2.multiply(Y);
            const YsquareZdiv4 = YsquareZdiv2.divide(2);
            A = YZdiv2.add(1);
            B = Z;
            C = YsquareZdiv4.add(Y);

        }
        else if (model === 2) {
            const f = this.freq;
            const lineLength = this.lineLength;
            const r = this.RperCond() / lineLength / 1000; //add
            const l = this.LandCperPhasePerKm().inductance / 1000; //m
            const c = this.LandCperPhasePerKm().capacitance / 1000; //m
            const z = new complex(r, 2 * Math.PI * f * l);
            const y = new complex(0, 2 * Math.PI * f * c);
            const Zc = z.divide(y).sqrt();
            const yz = y.multiply(z)
            const gamma = y.multiply(z).sqrt(); //lossless or lossful?
            A = gamma.multiply(lineLength * 1000).cosh(); //beta is per meter
            B = gamma.multiply(lineLength * 1000).sinh().multiply(Zc);
            C = gamma.multiply(lineLength * 1000).sinh().divide(Zc);
        }
        else {
            throw new Error('wrong model!');
        }
        //convert to complex numbers if not already
        if (typeof A === 'number') {
            A = new complex(A, 0);
        }
        if (typeof B === 'number') {
            B = new complex(B, 0);
        }
        if (typeof C === 'number') {
            C = new complex(C, 0);
        }
        D = A;
        return { A: A, B: B, C: C, D: D };
    }
    Ir() {
        const Vr = this.Vnom_kV;
        const loadMW = this.loadMW / 3;
        const pf = this.pf;
        const S = new complex(loadMW, loadMW / pf * Math.sin(Math.acos(pf)));
        const Ir_star = S.divide(Vr); //kA
        const Ir = Ir_star.conjugate();
        return Ir;

    }
    Vs_kV_line_phase() {
        const A = this.ABCDparams().A;
        const B = this.ABCDparams().B;
        const C = this.ABCDparams().C;
        const D = this.ABCDparams().D;
        const Vr = this.Vnom_kV;
        const Ir = this.Ir();
        const AVr = A.multiply(Vr);
        const BIr = B.multiply(Ir);
        const Vs_phase = AVr.add(BIr);
        const Vs_line = Vs_phase.multiply(Math.sqrt(3)).multiply(new complex(Math.sqrt(3) / 2, 1 / 2)) //when converting to linetoline we have a phase shift too?? confirm..
        return { linetoline: Vs_line, phase: Vs_phase }; //line to line voltage
    }
    Is_A() {
        const A = this.ABCDparams().A;
        const B = this.ABCDparams().B;
        const C = this.ABCDparams().C;
        const D = this.ABCDparams().D;
        const Vr = this.Vnom_kV;
        const Ir = this.Ir();
        const CVr = C.multiply(Vr);
        const DIr = D.multiply(Ir);
        const Is = CVr.add(DIr).multiply(1000); //kA to A
        return Is;

    }
    Icharging_A() {
        const model = this.model;

        const Vr = new complex(this.Vnom_kV, 0);
        const Vs = this.Vs_kV_line_phase().phase;

        if (model === 1) {
            // Nominal π model
            const XC = this.XLandXC().Reactance_C;
            const Y = new complex(0, 1 / XC);

            const IC1 = Y.divide(2).multiply(Vr);
            const IC2 = Y.divide(2).multiply(Vs);

            return IC1.add(IC2).multiply(1000);
        }

        else if (model === 2) {
            // Distributed model (using C * Vr)
            const C = this.ABCDparams().C;
            return C.multiply(Vr).multiply(1000);
        }

        else {
            return new complex(0, 0);
        }
    }
    Icharging_components_A() {
        // Returns { IC1, IC2 } in Amperes for the nominal π model only.
        // IC1 = (Y/2)·VR  (receiving-end shunt, leads VR by 90°)
        // IC2 = (Y/2)·VS  (sending-end shunt, leads VS by 90°)
        // Returns null for short line and distributed models (no lumped π split).
        if (this.model !== 1) return null;

        const Vr = new complex(this.Vnom_kV, 0);
        const Vs = this.Vs_kV_line_phase().phase;
        const XC = this.XLandXC().Reactance_C;
        const Y = new complex(0, 1 / XC);

        const IC1 = Y.divide(2).multiply(Vr).multiply(1000);
        const IC2 = Y.divide(2).multiply(Vs).multiply(1000);

        return { IC1, IC2 };
    }
    percent_VR() {
        const A = this.ABCDparams().A;
        const Vr = this.Vnom_kV;
        const mod_Vr_fullLoad = Vr; //cuz we already took only magnitude anyways
        const Vs = this.Vs_kV_line_phase().phase;
        const mod_Vr_noLoad = Vs.modulus() / A.modulus();
        const percent_VR = (mod_Vr_noLoad - mod_Vr_fullLoad) / mod_Vr_fullLoad * 100;
        return percent_VR;
    }
    power_loss_MW_and_efficiency() {
        const Vs = this.Vs_kV_line_phase().phase;
        const Is = this.Is_A().divide(1000); //kA
        const Vr = this.Vnom_kV;
        const Ir = this.Ir();
        const Is_star = Is.conjugate();
        const Ir_star = Ir.conjugate();
        const S_sending = Vs.multiply(Is_star);
        const S_receiving = Ir_star.multiply(Vr); //Vr isnt complex class after all.. ilam if you think this is unsafe mabye change Vr into complex before the calculations im too lazy to do that.
        const power_loss = S_sending.subtract(S_receiving).multiply(3); //total 3 phase loss
        const power_loss_MW = power_loss.re;
        const efficiency = S_receiving.re / S_sending.re; //single phase and three phase efficiency same
        return { power_loss_MW: power_loss_MW, efficiency: efficiency };
    }
    Zc() {
        const l = this.LandCperPhasePerKm().inductance / 1000;
        const c = this.LandCperPhasePerKm().capacitance / 1000;
        const Zc = Math.sqrt(l / c);
        return Zc;

    }
    SIL_MW() {
        const Zc = this.Zc(); //ohms
        const Vr = this.Vnom_kV; //kV
        const SIL = (Vr * Vr) / Zc * 3; //three phase load consumption
        return SIL;
    }
}
