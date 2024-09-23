const express = require("express");
const MainController = require("../controller/mainController");

const router = express.Router();

router.get("/", MainController.getHome);
router.post("/add-url-live-fb", MainController.makeUrlLiveFb);
router.post("/live-video", MainController.liveVideo);
router.post("/stop-live-video", MainController.stopLiveVideoToken);

module.exports = router;