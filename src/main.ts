if (new URLSearchParams(location.search).has("legacy"))
  void import("../experiments/afterimage/main");
else void import("./field/main");
