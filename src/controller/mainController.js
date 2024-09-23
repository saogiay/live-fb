const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

class MainController {
  static streams = new Map();

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
    let { url, key_live, streamId, videoPath } = req.body;
    let rtmpUrl = `${url}`;
    if (!url.includes('rtmps://live-api-s.facebook.com:443/rtmp/')) {
      return res.status(400).json({ error: 'Invalid streaming URL' });
    }
    if (url === 'rtmps://live-api-s.facebook.com:443/rtmp/' && !key_live) {
      return res.status(400).json({ error: 'require key_live' });
    } else {
      rtmpUrl = `${url}/${key_live}`;
    }

    if (!streamId && key_live) {
      const regex = /^FB-(\d+)-/;

      const match = key_live.match(regex);

      if (match) {
          streamId = match[1];
          console.log(streamId);
      } else {
          console.log("ID không hợp lệ");
      }
    }

    if (MainController.streams.has(streamId)) {
      return res.status(400).json({ error: 'A stream with this ID is already in progress' });
    }

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    const streamVideo = (streamId) => {
      const ffmpegCommand = ffmpeg(videoPath)
        .inputOptions(['-stream_loop', '-1', '-re'])
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
          console.log(`Stream ${streamId} started with command:`, commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Stream ${streamId} processing:`, progress.percent, '% done');
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`Error in stream ${streamId}:`, err);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          if (MainController.streams.has(streamId) && !MainController.streams.get(streamId).stopping) {
            console.log(`Restarting stream ${streamId} due to error...`);
            setTimeout(() => streamVideo(streamId), 5000);
          }
        })
        .on('end', () => {
          console.log(`Stream ${streamId} ended`);
          if (MainController.streams.has(streamId) && !MainController.streams.get(streamId).stopping) {
            console.log(`Restarting stream ${streamId}...`);
            setTimeout(() => streamVideo(streamId), 1000);
          } else {
            MainController.streams.delete(streamId);
          }
        });

      ffmpegCommand.save(rtmpUrl);
      MainController.streams.set(streamId, { command: ffmpegCommand, url: rtmpUrl, videoPath, stopping: false });
    };

    streamVideo(streamId);

    res.json({ status: 'success', message: 'Live stream started with auto-replay', streamId });
  }

  static async stopLiveVideoToken(req, res) {
    try {
      const { streamId } = req.body;
      if (!streamId) {
        return res.status(400).json({ error: 'Stream ID is required' });
      }

      if (MainController.streams.has(streamId)) {
        const streamData = MainController.streams.get(streamId);
        streamData.stopping = true;
        const { command } = streamData;
        
        command.kill('SIGINT');
        
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.log(`Forcing termination of stream ${streamId}`);
            command.kill('SIGKILL');
            resolve();
          }, 10000);

          command.on('exit', () => {
            console.log(`Stream ${streamId} has been terminated`);
            clearTimeout(timeout);
            resolve();
          });
        });

        MainController.streams.delete(streamId);
        console.log(MainController.streams);
        
        return res.json({ status: 'success', message: `Live stream ${streamId} stopped` });
      } else {
        return res.status(400).json({ error: `No active live stream found with ID ${streamId}` });
      }
    } catch (error) {
      console.error('Error ending live video:', error.message);
      return res.status(500).json({ error: 'Failed to end live video', details: error.message });
    }
  }

  static async startMultipleStreams(req, res) {
    const { streams } = req.body;
    if (!Array.isArray(streams) || streams.length === 0) {
      return res.status(400).json({ error: 'Invalid streams data' });
    }

    const results = [];
    for (const stream of streams) {
      try {
        const { url, key_live, videoPath } = stream;
        const streamId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const rtmpUrl = `${url}/${key_live}`;

        if (!fs.existsSync(videoPath)) {
          results.push({ streamId, status: 'error', message: 'Video file not found' });
          continue;
        }

        const streamVideo = () => {
          const ffmpegCommand = ffmpeg(videoPath)
            .inputOptions(['-stream_loop', '-1', '-re'])
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
              console.log(`Stream ${streamId} started with command:`, commandLine);
            })
            .on('error', (err) => {
              console.error(`Error in stream ${streamId}:`, err);
              if (MainController.streams.has(streamId)) {
                console.log(`Restarting stream ${streamId} due to error...`);
                setTimeout(() => streamVideo(streamId), 5000);
              }
            })
            .on('end', () => {
              console.log(`Stream ${streamId} ended, restarting...`);
              if (MainController.streams.has(streamId)) {
                setTimeout(() => streamVideo(streamId), 1000);
              }
            });

          ffmpegCommand.save(rtmpUrl);
          MainController.streams.set(streamId, { command: ffmpegCommand, url: rtmpUrl, videoPath });
        };

        streamVideo();
        results.push({ streamId, status: 'success', message: 'Live stream started' });
      } catch (error) {
        console.error('Error starting stream:', error);
        results.push({ status: 'error', message: error.message });
      }
    }

    res.json({ results });
  }

  static async stopMultipleStreams(req, res) {
    const { streamIds } = req.body;
    if (!Array.isArray(streamIds) || streamIds.length === 0) {
      return res.status(400).json({ error: 'Invalid stream IDs' });
    }

    const results = [];
    for (const streamId of streamIds) {
      try {
        if (MainController.streams.has(streamId)) {
          const { command } = MainController.streams.get(streamId);
          command.kill('SIGINT');
          
          await new Promise((resolve) => {
            command.on('exit', () => {
              console.log(`Stream ${streamId} has been terminated`);
              resolve();
            });
            
            setTimeout(() => {
              console.log(`Forcing termination of stream ${streamId}`);
              command.kill('SIGKILL');
              resolve();
            }, 5000);
          });

          MainController.streams.delete(streamId);
          results.push({ streamId, status: 'success', message: 'Live stream stopped' });
        } else {
          results.push({ streamId, status: 'error', message: 'No active live stream found with this ID' });
        }
      } catch (error) {
        console.error(`Error stopping stream ${streamId}:`, error);
        results.push({ streamId, status: 'error', message: error.message });
      }
    }

    res.json({ results });
  }
}

module.exports = MainController;