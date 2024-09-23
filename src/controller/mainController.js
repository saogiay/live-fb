const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

class MainController {
  static ffmpegCommand = null;
  static isStreaming = false;

  static getHome(req, res) {
    res.send("Hello World from MainController!");
  }

  static async makeUrlLiveFb(req, res) {
    try {
      const { token, description, title, pageID } = req.body;
      const apiUrl = `https://graph.facebook.com/v18.0/${pageID}/live_videos`;
      let response = await axios.post(apiUrl, {
        access_token: token,
        description: description,
        title: title,
      });
      console.log(response.data);
      res.json(response.data);
    } catch (error) {
      console.error('Error creating live video:', error.response ? error.response.data : error.message);
      res.status(500).json({ error: 'Failed to create live video' });
    }
  }

  static liveVideo(req, res) {
    const { url, key_live } = req.body;
    console.log('Streaming URL:', url);
    const videoPath = 'F:\\tiktok-live-downloader\\downloads\\phuong.nga.0811-1531082092024.mp4';

    if (MainController.isStreaming) {
      return res.status(400).json({ error: 'A stream is already in progress' });
    }

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    let rtmpUrl = `${url}/${key_live}`;
    
    MainController.isStreaming = true;

    const streamVideo = () => {
      MainController.ffmpegCommand = ffmpeg(videoPath)
        .inputOptions(['-stream_loop', '-1', '-re']) // Loop input infinitely and read at native framerate
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-tune zerolatency',
          '-maxrate 2500k',
          '-bufsize 5000k',
          '-pix_fmt yuv420p',
          '-g 60',
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-f flv'
        ])
        .on('start', (commandLine) => {
          console.log('Spawned FFmpeg with command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log('Processing:', progress.percent, '% done');
        })
        .on('error', (err, stdout, stderr) => {
          console.error('Error during video streaming:', err);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          if (MainController.isStreaming) {
            console.log('Restarting stream due to error...');
            streamVideo(); // Restart the stream if it's still supposed to be streaming
          }
        })
        .on('end', () => {
          console.log('Video streaming ended, restarting...');
          if (MainController.isStreaming) {
            streamVideo(); // Restart the stream if it's still supposed to be streaming
          }
        });

      MainController.ffmpegCommand.save(rtmpUrl);
    };

    streamVideo(); // Start the initial stream

    res.json({ status: 'success', message: 'Live stream started with auto-replay' });
  }

  static async topLiveVideoToken(req, res) {
    try {
      // const { token, liveVideoID } = req.body;
      // const apiUrl = `https://graph.facebook.com/v18.0/${liveVideoID}?end_live_video=true&access_token=${token}`;
      // let response = await axios.post(apiUrl, {
      //   params: { access_token: token}
      // });
      // if (response.status === 200) {
        if (MainController.ffmpegCommand) {
          MainController.ffmpegCommand.kill('SIGKILL');
          MainController.ffmpegCommand = null;
          return res.json({ status: 'success', message: 'Live stream stopped' });
        } else {
          return res.status(400).json({ error: 'No active live stream to stop' });
        }
      // }
      // return res.json(response.data);
    } catch (error) {
      console.error('Error ending live video:', error.response ? error.response.data : error.message);
      return res.status(500).json({ error: 'Failed to end live video' });
    }
  }
}

module.exports = MainController;