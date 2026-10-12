import zipfile, io, zlib

# Raw string exactly as received in the user prompt:
raw = """api/PK 0TL] README.mduV +n9U M ~BW\\ bE_P i5Gi .?N/ 9~G9 Rm1\\# uPn_ |<*^ Ce=\x27 o-Tw }wt" 0TL]qx index.html i(rt !dyq ?c~\x27 E2m, uf-8 #uvr b1D)Eqh =h6O 4%!Q Aeh: R`a<Vr 6J2. Z%EvEL f,e~ 59FdI LLb( :> w \\_#8l 8" e AORN9H ^jpwU 4poG( *rtqM ur-cnA 34`T |lwXZ 4=Ka| aT~I |jk8 C=Sdw qmu < H}Hd)4 \\s[Y nf3j1`$L ez@I.g P50]O $(\\W y)Scy Bs>iI C+%R (vSN  (UYJ k Z< h_X`C^/2V Vxuo A\\-% >77Y<J >O.Y & o3 )o#: Bkb1we 77\x27O af?z rUL{ &(PB _Zme yCG\x27l %~@U A9g> $bjn (K.A !<0Qs. )9[) $0~: 1IR\x27 /*{) uqA%r{6y WD:U Dz!77 u;u| ;3 E DI?V Lp\\N u*@U J\C@ xLOZ *CU*7 1[HG uWdJ_ v!N+vQ  0hU d+Wr iS<6 c\\Ln ]+|r Tz&-O 0U:C ! :h Tq%P =L3+ ,[FP C</% NKKX  \\hz tlR5i h@/I WEnn L)6= !w<G `q:CGpc ==Sa _[a$qE Vf|.u _f(/ jJ35I9 P2m[ G~Z\ QL]E7u" {Fjb, < zU ci5R &`$J 3k[[ 7ej4 Du>G AI2@ ev"u CK1n zgCK |c#t ,ob_ d<7T .?XDZ R&MW RkB@R Flk: [@E>I} ~eU5 %AYm  @C?k vs#o }gml ^~$Li VD]uC =.s, _Z + XMXT \x27N@Z  O"< <m/w qw:%r $!z>] +fNU  2VH *\\:+ V@KW \x27(zt W[Q8 }d~vm ,+sH/ r4q{ ~_\\l =Yd[^t cR-~z {|\\$ PD%A VZ))B^ ?>y)f MF3f 2)8D._Y *\x27//+ 4,{\x27  DyhR bI}X %Cy\\ [h+$ f&7& 1^"w!o  O|b![ t-6kK pk<3~ )c#\\F ry1- JV/5 (SL]l .gitignore +K-JN (SL] package.json% 0TL] api/index.js k)f2U lY\x27y6 g*N* ISKav 4GQS xxd]W z[z1H xE>~p  #"!cZ Z7|b ^G:;*Ky yIZqS Uu{W 0j~A 0p?<B$ Bd]# lnGBMD W5[ [2 lqxH \x27rp6 PSx? 1txS& n=rZgt~ )tV$<$ $b#/ hA0I  $&}l_2~ 0625 M{;6 3%~h -_N< 55~t2 r$#F Hm4l"Ia OIFx R]5p5 m_vw yj{ I N7IV. <puB 1?[\x27=n ;:w$? (ig1 vEt1jEj Bd)) eg7:| ETLP Fs)> S*c( %~Se r\x27A|* 9!/J_ 17=: ?sENI H9ap z,kI C\\nTUQ api/PK 0TL] README.mdPK 0TL]qx index.htmlPK (SL]l .gitignorePK (SL] package.jsonPK 0TL] api/index.jsPK"""

# Find files mentioned
print("Raw length:", len(raw))
for line in raw.split("PK"):
    print("CHUNK:", repr(line[:35]))

