# 大文件分片上传

## 处理文件切片

- 为了提升性能上传大文件时通常会将文件切成多个，并行上传至服务端
- 另外为了实现后面的秒传功能，还需要根据文件内容生成 `唯一标识`
- 所以我们需要根据文件的内容生成一个 hash 值来表示唯一的这个文件
- 文件内容如果一致 那么产生的文件 hash 名也一样

  FILE_CHUNK_SIZE = 1024 \* 1024 \* 100; // 切片大小

  const chunk = file.slice(index \* FILE_CHUNK_SIZE,(index + 1) \* FILE_CHUNK_SIZE); // 单个文件包

  比如文件为 250M ， 每隔 100M 切成一片 ， 也就是 Math.ceil(file.size / FILE_CHUNK_SIZE); 使用 Math.ceil 向上取整 即为 3 , 循环这个数字，上面的 index 就是 0 , 1 , 2

  第一片：0m ~ 100m
  第二片：100m ~ 200m
  第三片: 200m ~ 250m

- 拿到文件后并行上传，如果分片过多可控制并发量，比如一个时间内最多上传 5 个分片

octet-stream 和 form-data 区别

前者只能在请求体传二进制 后者还可以在请求体中传额外字段

- 总进度条：拿到所有分片进度平均值 / 数量

## 秒传功能:

- 前端上传文件前请求接口看一下服务端 public 没有有上传过这个文件如果有直接返回结果，如果没有才需要上传
- 如果 needUpload 为 false，表示该文件服务端已经存在，则直接返回
  - 客户端：
    if (!needUpload) {
    message.success("文件已存在秒传成功");
    return resetAllStatus();
    }
  - 服务端：
    const { filename } = req.params; // 从查询参数拿到文件名
    const filePath = path.resolve(PUBLIC_DIR, filename); // 将 public 目录和文件名处理为完整目录
    const isExists = await fs.pathExists(filePath); // 判断是否存在文件
