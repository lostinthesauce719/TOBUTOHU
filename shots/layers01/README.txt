layers01 — kamishibai render layers + bolder grasshopper (visual only)
SIM_VERSION tobu-sim-5 untouched. Tests: 14 + saves + 7 flash green.

Layers (?layer=far|mid|play|fg|all): far=sky+mountains, mid=cedars/falls/steam/birds,
play=climbables+hero+mist, fg=near-camera weather framing. Parallax is camera-driven only.

Per-season stills (seed 1, 540×960):
  {spring,summer,autumn,winter}_{far,mid,play,fg,all}.png
  spring t=43.9  draws(all)=22
  summer t=160.2 draws(all)=26
  autumn t=249.5 draws(all)=26
  winter t=395   draws(all)=28

Chase-cam for BRUSH (?cam=close):
  chase_ground.png  t=12
  chase_climb.png   t=45
  chase_storm.png   t=160.2

Hero idle+climb clip:
  hero_idle_climb.mp4  t0=6  10s  24fps  cam=close  maxDraws=16

Sheets: seasons_combined_sheet.png, spring_layers_strip.png
