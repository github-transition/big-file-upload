const express = require("express");
const logger = require("morgan");
const { StatusCodes } = require("http-status-codes");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");

const TEMP_DIR = path.resolve(__dirname, "temp");
const PUBLIC_DIR = path.resolve(__dirname, "public");
const CHUNK_SIZE = 1024 * 1024 * 100; // 100M

// 确保目录存在如果不存在就创建
// 存放合并并合并好的文件
fs.ensureDirSync(path.resolve(__dirname, "public"));
// 存放分片的文件
fs.ensureDirSync(path.resolve(__dirname, "temp"));

const app = express();

app.use(logger("dev")); // 日志
app.use(cors()); // 允许跨域
app.use(express.json()); // 解析post的JSON
app.use(express.urlencoded({ extended: false })); // 解析查询参数
app.use(express.static(path.resolve(__dirname, "public"))); // 将 public目录 设为静态资源目录

app.get(`/verify/:filename`, async (req, res, next) => {
  const { filename } = req.params;
  const filePath = path.resolve(PUBLIC_DIR, filename);
  const isExists = await fs.pathExists(filePath);
  const chunkDir = path.resolve(TEMP_DIR, filename);
  const existsDir = await fs.pathExists(chunkDir);
  let chunkFileSizes = [];
  if (existsDir) {
    // 读取分片文件夹下的所有分片文件
    const chunkFiles = await fs.readdir(chunkDir);
    // 获取每个分片文件的大小
    chunkFileSizes = await Promise.all(
      chunkFiles.map(async (chunkFile) => {
        const chunkFileStat = await fs.stat(path.resolve(chunkDir, chunkFile));
        return {
          chunkFileName: chunkFile,
          chunkFileSize: chunkFileStat.size,
        };
      })
    );
    // 获取每个分片文件的大小
  }
  res.json({
    success: true,
    needUpload: !isExists,
    path: isExists ? filePath : null,
    chunkFileSizes,
  });
});

app.post(`/upload/:filename`, async (req, res, next) => {
  fs.ensureDirSync(path.resolve(__dirname, "temp"));
  // 通过路径参数获取文件名
  const { filename } = req.params;
  // 通过查询参数获取分片名
  const { chunkFileName } = req.query;
  const start = isNaN(req.query.start) ? 0 : parseInt(req.query.start);
  // 创建用户保存此文件的目录
  const chunkDir = path.resolve(TEMP_DIR, filename);
  // 创建用户保存此分片的目录
  const chunkFilePath = path.resolve(chunkDir, chunkFileName);
  // 确保分片文件存在(如果不存在就创建)
  await fs.ensureDir(chunkDir);
  // 创建此文件的可写流操作对象
  const ws = fs.createWriteStream(chunkFilePath, { start, flags: "a" });
  // 监听暂停操作，如果用户点击了暂停，会取消上面的上传操作
  req.on("aborted", () => {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR);
    ws.close();
  });
  try {
    await pipeStream(req, ws);
    res.status(StatusCodes.OK).json({
      success: true,
      message: "上传成功",
    });
  } catch (error) {
    next(error);
  }
});

app.get(`/merge/:filename`, async (req, res, next) => {
  fs.ensureDirSync(path.resolve(__dirname, "public"));
  // 通过路径参数获取文件名
  const { filename } = req.params;
  // 创建合并后的文件路径
  const mergedFilePath = path.resolve(PUBLIC_DIR, filename);
  // 获取分片文件夹
  const chunkDir = path.resolve(TEMP_DIR, filename);
  // 获取分片文件夹下的所有分片文件
  const chunkFiles = await fs.readdir(chunkDir);
  // 根据分片文件名-后的下标进行升序排序
  chunkFiles.sort((a, b) => {
    return Number(a.split("-")[1]) - Number(b.split("-")[1]);
  });
  // 创建合并后的文件的可写流操作对象
  const pipes = chunkFiles.map((chunkFile, index) => {
    return pipeStream(
      fs.createReadStream(path.resolve(chunkDir, chunkFile), {
        autoClose: true,
      }),
      fs.createWriteStream(mergedFilePath, { start: index * CHUNK_SIZE })
    );
  });
  try {
    // 并发上传
    await Promise.all(pipes);
    // 删除temp目录下的分片文件夹
    await fs.rmdir(chunkDir, { recursive: true });
    res.status(StatusCodes.OK).json({
      success: true,
      message: "合并成功了--来自服务端",
    });
  } catch (error) {
    next(error);
  }
});

app.listen(8888, () => {
  console.log("Server is running on port 8888");
});

function pipeStream(rs, ws) {
  return new Promise((resolve, reject) => {
    rs.pipe(ws).on("finish", resolve).on("error", reject);
  });
}
