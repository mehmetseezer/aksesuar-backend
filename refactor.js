const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Bulk Product
    content = content.replace(/NewProduct/g, 'BulkProduct');
    content = content.replace(/newProduct/g, 'bulkProduct');
    content = content.replace(/new-product/g, 'bulk-product');
    content = content.replace(/new_product/g, 'bulk_product');
    
    // Single Device
    content = content.replace(/UsedProduct/g, 'SingleDevice');
    content = content.replace(/usedProduct/g, 'singleDevice');
    content = content.replace(/used-product/g, 'single-device');
    content = content.replace(/used_product/g, 'single_device');

    // UsedStatus and condition -> device_condition
    content = content.replace(/UsedStatus/g, 'DeviceStatus');
    // Note: this might not be enough for condition -> device_condition, we will fix DTOs manually since they require type changes

    fs.writeFileSync(filePath, content, 'utf8');
}

function processDirectory(directory) {
    fs.readdirSync(directory).forEach(file => {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            replaceInFile(fullPath);
        }
    });
}

// Process server src
processDirectory(path.join(__dirname, 'src'));

// Rename files in product/bulk-product
const bulkDir = path.join(__dirname, 'src/product/bulk-product');
if (fs.existsSync(bulkDir)) {
    fs.readdirSync(bulkDir).forEach(file => {
        if(file.includes('new-product')) {
            fs.renameSync(path.join(bulkDir, file), path.join(bulkDir, file.replace('new-product', 'bulk-product')));
        }
    });
    const dtoDir = path.join(bulkDir, 'dto');
    if (fs.existsSync(dtoDir)) {
        fs.readdirSync(dtoDir).forEach(file => {
            if(file.includes('new-product')) {
                fs.renameSync(path.join(dtoDir, file), path.join(dtoDir, file.replace('new-product', 'bulk-product')));
            }
        });
    }
}

// Rename files in product/single-device
const singleDir = path.join(__dirname, 'src/product/single-device');
if (fs.existsSync(singleDir)) {
    fs.readdirSync(singleDir).forEach(file => {
        if(file.includes('used-product')) {
            fs.renameSync(path.join(singleDir, file), path.join(singleDir, file.replace('used-product', 'single-device')));
        }
    });
    const dtoDir = path.join(singleDir, 'dto');
    if (fs.existsSync(dtoDir)) {
        fs.readdirSync(dtoDir).forEach(file => {
            if(file.includes('used-product')) {
                fs.renameSync(path.join(dtoDir, file), path.join(dtoDir, file.replace('used-product', 'single-device')));
            }
        });
    }
}

console.log('Backend refactoring script finished.');
