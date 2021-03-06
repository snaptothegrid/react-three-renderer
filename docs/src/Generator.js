import fs from 'fs';
import path from 'path';
import del from 'del';
import getImageDataForColor from './utils/getImageDataForColor';

// TODO: WRITE A REACTJS RENDERER TO GENERATE DOCUMENTATION
// OH MY GOD YOU ARE A GENIUS
//   I KISS YOU

function clearImageDirectory() {
  const imagePath = 'wiki/images';

  if (fs.existsSync(imagePath)) {
    del.sync(imagePath);
  }

  fs.mkdirSync(imagePath);
}

const rightArrowSymbol = '»'; // was: '▸' but GitHub apparently does not like this

function getLineage(category) {
  const lineage = [];
  let parent = category.parent;

  while (parent) {
    if (parent.name) {
      lineage.push(parent.name);
    }

    parent = parent.parent;
  }

  lineage.reverse();
  return lineage;
}

function normalizeFilename(filename) {
  return filename.replace(/\s+/, '-');
}

function addFileToWrite(files, filename, contents) {
  const lowercaseFilename = filename.toLowerCase();
  if (files[lowercaseFilename]) {
    throw new Error(`The filename ${filename} will already be written into!`);
  }

  files[lowercaseFilename] = {
    filename: normalizeFilename(filename),
    contents,
  };
}

function appendToFileToWrite(files, filename, contents) {
  const lowercaseFilename = filename.toLowerCase();
  if (!files[lowercaseFilename]) {
    throw new Error(`The filename ${filename} does not exist!`);
  }

  files[lowercaseFilename].contents += contents;
}

function mockPropTypes() {
  const ReactPropTypes = require('react/lib/ReactPropTypes');

  class PropType {
    constructor(type, isRequired = false) {
      this._type = type;

      this._isRequired = isRequired;
      if (!isRequired) {
        this.isRequired = new PropType(type, true);
      }
    }

    toString() {
      let req = '';
      if (this._isRequired) {
        req = ' *``` required ```*';
      }

      if (this._type.indexOf('\n') !== -1) {
        return `${'```'}\n${this._type}\n${'```'}${req}`;
      }

      return `${'```'} ${this._type} ${'```'}${req}`;
    }
  }

  [
    'array',
    'bool',
    'boolean',
    'function',
    'number',
    'object',
    'string',
    'any',
    'element',
    'node',
  ].forEach((type) => {
    ReactPropTypes[type] = new PropType(type);
  });

  ReactPropTypes.func = new PropType('function');

  ReactPropTypes.arrayOf = (instanceType) => {
    let instanceTypeString = `${instanceType.displayName || instanceType.name
    || instanceType._type || instanceType}`;

    if (instanceType instanceof PropType && instanceType._isArray) {
      instanceTypeString = `(${instanceTypeString})`;
    }

    const propType = new PropType(`array of ${instanceTypeString}`);

    propType._isArray = true;

    return propType;
  };

  ReactPropTypes.instanceOf = instanceType =>
    new PropType(`${instanceType.displayName || instanceType.name
    || instanceType._type || instanceType}`);

  ReactPropTypes.objectOf = instanceType =>
    new PropType(`object of ${instanceType.displayName || instanceType.name
    || instanceType._type || instanceType}`);

  ReactPropTypes.oneOf = values => new PropType(`one of [${values.map((value) => {
    if (typeof value === 'string') {
      return `'${value}'`;
    }

    return value;
  }).join(', ')}]`);

  ReactPropTypes.oneOfType = values =>
    new PropType(`one of types [${values.map(value => value.displayName
      || value.name || value._type || value
    ).join(', ')}]`);

  ReactPropTypes.shape = (shape) => {
    function describeShape(shapeToDescribe) {
      const result = {};

      Object.keys(shapeToDescribe).forEach((shapeKey) => {
        const value = shapeToDescribe[shapeKey];

        if (value.isShape) {
          result[shapeKey] = value.rawShape;
        } else {
          result[shapeKey] = `${value}`.replace(/\s*`+\s*/g, '');
        }
      });

      return result;
    }

    function tab(numTabs) {
      let result = '';

      for (let i = 0; i < numTabs; ++i) {
        result += '\t';
      }

      return result;
    }

    function stringify(obj, numTabs = 0, ignoreFirstTab = false) {
      // like JSON.stringify but without quotes

      if (typeof obj === 'object') {
        let result = '';

        if (!ignoreFirstTab) {
          result = `${tab(numTabs)}{`;
        } else {
          result = '{';
        }

        Object.keys(obj).forEach((key, idx) => {
          const valueString = stringify(obj[key], numTabs + 1, true);
          if (idx !== 0) {
            result += ',';
          }
          result += `\n${tab(numTabs + 1)}${key}: ${valueString}`;
        });

        result += `\n${tab(numTabs)}}`;

        return result;
      }

      return `${obj}`;
    }

    const result = new PropType(`shape of \n${stringify(describeShape(shape))}`);

    result.isShape = true;
    result.rawShape = describeShape(shape);

    return result;
  };
}

function buildCategories() {
  const categoryTree = require('./internalComponentCategories');

  const flatCategories = {};

  const rebuiltTree = {
    root: {
      name: null,
      isRoot: true,
      children: [],
    },
  };

  const queue = [{
    name: null,
    parent: null,
    node: {
      treeNode: rebuiltTree.root,
      children: {
        ...categoryTree,
      },
    },
  }];

  while (queue.length > 0) {
    const {
      name: currentName,
      node: {
        treeNode,
        children: nodeChildren,
      },
    } = queue.shift();

    if (nodeChildren) {
      const childNames = Object.keys(nodeChildren);

      for (let i = 0; i < childNames.length; ++i) {
        const childName = childNames[i];

        let childData = nodeChildren[childName];
        if (!childData.isComponent) {
          const normalizedNodeName = normalizeFilename(childName);
          try {
            const moduleName = `./categories/${normalizedNodeName}`;
            /* eslint-disable import/no-dynamic-require */
            const loadedModule = require(moduleName);
            /* eslint-enable import/no-dynamic-require */

            if (childData === true) {
              // noinspection NodeRequireContents
              childData = loadedModule;
            } else {
              // noinspection NodeRequireContents
              childData = {
                ...childData,
                ...loadedModule,
              };
            }
          } catch (e) {
            // do nothing
            console.log(`Missing category info file for ${normalizedNodeName}`); // eslint-disable-line
          }
        }

        const childTreeNode = {
          isRoot: false,
          parent: treeNode,
          name: childName,
          intro: childData.intro,
          fileIntro: childData.fileIntro,
          data: childData,
          children: [],
        };

        if (flatCategories[childName]) {
          throw new Error('This category already exists...');
        }

        flatCategories[childName] = childTreeNode;

        treeNode.children.push(childTreeNode);

        queue.push({
          parent: currentName,
          name: childName,
          node: {
            ...childData,
            treeNode: childTreeNode,
          },
        });
      }
    }
  }

  return {
    flat: flatCategories,
    tree: rebuiltTree,
  };
}

function writeCategories(allCategories, descriptors, filesToWrite, prefix) {
  let fileContents = `> [Wiki](Home) ${rightArrowSymbol} **API Reference**

# API Reference

## Contents
`;

  const categoryStack = [{
    stackParent: null,
    node: allCategories.tree.root,
    indent: -1,
  }];

  const nameToHeaderItem = name => `[[${name}]] ${rightArrowSymbol} `;

  while (categoryStack.length > 0) {
    const stackItem = categoryStack.shift();

    const {
      isTodo,
      node,
      indent,
      stackParent,
    } = stackItem;

    let nodeContents = '';
    const nodeName = node.name;

    const nodeData = node.data;

    if (nodeName !== null) {
      if (isTodo) {
        nodeContents += `* ${nodeName}`;
      } else if (nodeData && nodeData.filename) {
        nodeContents += `* [${nodeName}](${normalizeFilename(nodeData.filename)})`;
      } else {
        nodeContents += `* [[${nodeName}]]`;
      }
    }

    const intro = node.intro;
    if (!node.isComponent && !node.isTodo && !node.isRoot) {
      let nodeFileContents = `> [Wiki](Home) ${rightArrowSymbol} `;

      const lineage = getLineage(node);

      nodeFileContents += lineage.map(nameToHeaderItem).join('');

      nodeFileContents += `**${nodeName}**`;

      nodeFileContents += `\n\n# ${nodeName}`;

      const fileIntro = node.fileIntro || intro;
      if (fileIntro) {
        nodeFileContents += `\n\n${fileIntro}`;
      }

      if (nodeData) {
        const description = nodeData.description ||
          (nodeData.getDescription && nodeData.getDescription.call(nodeData)) || undefined;
        if (description) {
          nodeFileContents += `\n\n${description}`;
        }
      }

      node.filename = `${prefix}${(nodeData && nodeData.filename) || nodeName}.md`;
      node.hasChildren = false;

      if (nodeData) {
        const descriptorNameToCopyAttributesFrom = nodeData.copyAttributesFrom;
        if (descriptorNameToCopyAttributesFrom) {
          const descriptor = descriptors[descriptorNameToCopyAttributesFrom];

          const attributesContents = descriptor._attributesContents;
          let attributesToCopy = Object.keys(attributesContents);

          const excludeAttributesFromCopying = nodeData.excludeAttributesFromCopying;
          if (excludeAttributesFromCopying) {
            attributesToCopy = attributesToCopy.filter(attributeName =>
              !excludeAttributesFromCopying[attributeName]);
          }

          if (attributesToCopy.length > 0) {
            nodeFileContents += '\n\n## Attributes\n\n';

            attributesToCopy.forEach((attributeName) => {
              nodeFileContents += `${attributesContents[attributeName]}`;
            });
          }
        }

        const subHeadings = nodeData.subHeadings;
        if (subHeadings) {
          const subheadingNames = Object.keys(subHeadings);
          for (let i = 0; i < subheadingNames.length; ++i) {
            const subHeadingName = subheadingNames[i];

            const subHeading = subHeadings[subHeadingName];

            const subHeadingDescription = subHeading.description;

            const grandchildren = subHeading.children;

            const grandchildrenNames = (grandchildren && Object.keys(grandchildren)) || [];

            if (grandchildrenNames.length > 0 || subHeadingDescription) {
              nodeFileContents += `\n\n## ${subHeadingName}:`;
            }

            if (subHeadingDescription) {
              nodeFileContents += `\n\n${subHeadingDescription}`;
            }

            if (grandchildrenNames.length > 0) {
              for (let j = 0; j < grandchildrenNames.length; ++j) {
                const attributeName = grandchildrenNames[j];

                const attributeInfo = grandchildren[attributeName];

                nodeFileContents += `\n\n### ${attributeName}
${attributeInfo.description}`;
              }
            }
          }
        }

        if (nodeData.sourceLink) {
          nodeFileContents += `\n\n===

|**[View Source](${nodeData.sourceLink})**|
 ---|`;
        }
      }

      nodeFileContents += '\n';

      addFileToWrite(filesToWrite, node.filename, nodeFileContents);
    }

    const children = node.children;

    let needsColon = false;

    if (nodeData) {
      if (!node.isComponent) {
        const todo = nodeData.TODO;
        if (todo && todo.length > 0) {
          needsColon = true;
          categoryStack.unshift({
            isTodo: true,
            stackParent: stackItem,
            node: {
              name: 'TODO',
              stackParent: stackItem,
              isTodo: true,
              children: todo.map(item => ({
                isTodo: true,
                name: item,
              })),
            },
            indent: indent + 1,
          });
        }
      }
    }

    if (children && children.length > 0) {
      needsColon = true;

      for (let i = children.length - 1; i >= 0; --i) {
        const child = children[i];

        categoryStack.unshift({
          isTodo,
          stackParent: stackItem,
          node: child,
          indent: indent + 1,
        });
      }
    }

    if (intro && intro.length > 0) {
      needsColon = true;
    }

    if (nodeName !== null && needsColon) {
      nodeContents += ':';
    }

    if (intro) {
      nodeContents += ` ${intro}`;
    }

    nodeContents += '\n';

    const ancestry = [];

    let currentParent = stackParent;
    while (currentParent) {
      ancestry.push(currentParent.node);

      currentParent = currentParent.stackParent;
    }

    for (let depth = 0; depth < ancestry.length; ++depth) {
      const ancestor = ancestry[depth];

      if (ancestor.filename) {
        let textToAppendToAncestor = '';

        if (!ancestor.hasChildren) {
          ancestor.hasChildren = true;

          const childrenName = ancestor.childrenName || 'Components';

          textToAppendToAncestor += `\n## ${childrenName}\n\n`;
        }

        for (let i = 0; i < depth; ++i) {
          textToAppendToAncestor += '  ';
        }

        textToAppendToAncestor += nodeContents;

        appendToFileToWrite(filesToWrite, ancestor.filename, textToAppendToAncestor);
      }
    }

    for (let i = 0; i < indent; ++i) {
      fileContents += '  ';
    }

    fileContents += nodeContents;
  }

  addFileToWrite(filesToWrite, `${prefix}API-Reference.md`, fileContents);
}

function getComponentInfo(componentName, propTypes) {
  // noinspection JSUnresolvedFunction
  const infoPath = path.join(__dirname, 'internalComponents', `${componentName}.js`);

  if (!fs.existsSync(infoPath)) {
    fs.writeFileSync(infoPath, `import DocInfo from '../DocInfo';

class ${componentName} extends DocInfo {
  getIntro() {
    return '';
  }

  getDescription() {
    return '';
  }

  getAttributesText() {
    return {${Object.keys(propTypes)
      .map(propName => `
      ${propName}: '',`).join('')}
    };
  }
}

module.exports = ${componentName};
`, 'utf8');
  }

  /* eslint-disable import/no-dynamic-require */
  return require(infoPath);
  /* eslint-enable import/no-dynamic-require */
}

function writeDescriptors(descriptors, allCategories, filesToWrite, prefix) {
  function writePropDocumentation(propTypes,
                                  componentInfo,
                                  descriptor,
                                  componentName) {
    return Promise.resolve().then(() => {
      const requiredProps = [];
      const optionalProps = [];

      Object.keys(propTypes).forEach((propName) => {
        if (propTypes[propName]._isRequired) {
          requiredProps.push(propName);
        } else {
          optionalProps.push(propName);
        }
      });

      let propNames;

      const propPriority = componentInfo.propPriority;

      if (propPriority) {
        const propWeight = (propName) => {
          if (propPriority.hasOwnProperty(propName)) {
            return propPriority[propName];
          }

          return 0;
        };

        const sortByPriority = (a, b) => propWeight(b) - propWeight(a);

        propNames = requiredProps.sort(sortByPriority)
          .concat(optionalProps.sort(sortByPriority));
      } else {
        propNames = requiredProps
          .concat(optionalProps);
      }

      const attributesText = componentInfo.getAttributesText(descriptor, componentName);

      const propDefaults = descriptor.propDefaults;

      if (descriptor.isResource) {
        if (attributesText.resourceId !== undefined && attributesText.resourceId !== '') {
          console.error(` ${componentName} already has resourceId?`); // eslint-disable-line
        }

        attributesText.resourceId = 'The resource id of this object,' +
          ' only used if it is placed into [[resources]].';
      }

      const attributesContents = {};

      descriptor._attributesContents = attributesContents;

      if (propNames.length > 0) {
        return Promise.all(propNames.map((propName, i) => {
          let propDetailText = '';

          // reserve its place
          attributesContents[propName] = '';

          if (i > 0) {
            propDetailText += '\n\n';
          }

          const typeString = propTypes[propName].toString();
          propDetailText += `### ${propName}\n${typeString}`;

          const propDescription = attributesText[propName];

          if (propDescription && propDescription.length > 0) {
            if (typeString.indexOf('\n') === -1) {
              propDetailText += ': ';
            } else {
              propDetailText += '\n';
            }

            propDetailText += `${propDescription}`;
          }

          return Promise.resolve()
            .then(() => {
              if (propDefaults.hasOwnProperty(propName)) {
                const propDefault = propDefaults[propName];
                if (propDefault !== undefined) {
                  let defaultText = '';

                  defaultText += '\n\n**Default**: `';

                  let colorPromise = Promise.resolve('');

                  if (propDefault && propDefault.isMockedThreeKey) {
                    defaultText += `${propDefault}`;
                  } else if (typeof propDefault === 'string') {
                    defaultText += `'${propDefault}'`;
                  } else if (Number.isInteger(propDefault)
                    && propTypes[propName]._type.toString() === // is a value for color
                    'one of types [THREE.Color, number, string]'
                  ) {
                    let numberString = propDefault.toString(16);

                    while (numberString.length < 6) {
                      numberString = `0${numberString}`;
                    }

                    numberString = `0x${numberString}`;

                    defaultText += numberString;

                    colorPromise = getImageDataForColor(propDefault, numberString)
                      .then(imageData =>
                        ` [[${imageData}]]`);
                  } else if (propDefault instanceof Array) {
                    defaultText += `[${propDefault.join(', ')}]`;
                  } else {
                    defaultText += `${propDefault}`;
                  }

                  defaultText += '`';

                  return colorPromise.then(colorMarkup =>
                    `${defaultText}${colorMarkup}`);
                }
              }

              return '';
            }).then((defaultText) => {
              propDetailText += defaultText;

              attributesContents[propName] = propDetailText;

              return Promise.resolve();
            });
        })).then(() => propNames.reduce((result, propName) =>
          `${result}${attributesContents[propName]}`, '\n\n## Attributes\n\n'));
      }

      return ('');
    });
  }

  return Promise.all(Object
    .keys(descriptors)
    .map((componentName) => {
      const descriptor = descriptors[componentName];

      const propTypes = descriptor.propTypes;

      const ComponentInfo = getComponentInfo(componentName, propTypes);

      const componentInfo = new ComponentInfo();

      const intro = componentInfo.getIntro();
      const description = componentInfo.getDescription();

      let fileContents = '';

      const category = allCategories.flat[componentName];
      if (!category) {
        console.log('no category found for ', componentName); // eslint-disable-line

        fileContents += `> [Wiki](Home) ${rightArrowSymbol} **${componentName}**`;
      } else {
        fileContents += `> [Wiki](Home) ${rightArrowSymbol} `;

        category.isComponent = true;

        const lineage = getLineage(category);

        fileContents += lineage
          .map(name => `[[${name}]] ${rightArrowSymbol} `).join('');

        fileContents += `**${componentName}**`;
      }

      fileContents += `\n\n# ${componentName}`;

      if (intro.length > 0) {
        fileContents += `\n\n${intro}`;
      }

      if (description.length > 0) {
        fileContents += `\n\n${description}`;
      }

      if (descriptor.isResource) {
        // move resourceId prop to the end

        const resourceIdProp = propTypes.resourceId;

        delete propTypes.resourceId;

        propTypes.resourceId = resourceIdProp;
      }

      return writePropDocumentation(propTypes,
        componentInfo,
        descriptor,
        componentName)
        .then((finalAttributesText) => {
          fileContents += finalAttributesText;

          if (category) {
            const children = category.children;

            if (children && children.length > 0) {
              fileContents += '\n\n## Children:'; // EOF

              for (let i = 0; i < children.length; ++i) {
                const child = children[i];

                fileContents += `\n  * [[${child.name}]]`;

                if (child.intro) {
                  fileContents += `: ${child.intro}`;
                }
              }
            }
          }

          let hasNotes = false;

          const ensureNotesHeaderAdded = () => {
            if (!hasNotes) {
              hasNotes = true;
              fileContents += '\n\n## Notes:';
            }
          };

          const footer = componentInfo.getFooter();
          if (footer.length > 0) {
            ensureNotesHeaderAdded();
            fileContents += `\n\n${footer}`;
          }

          if (descriptor.isResource) {
            ensureNotesHeaderAdded();
            fileContents += '\n\n';

            fileContents += 'This component can be added into [&lt;resources/&gt;](resources)!' +
              ' See [[Resource Types]] for more information.';
          }

          fileContents += `

===

|**[View Source](${`../blob/master/src/lib/${
            descriptor.constructor.__modulePath}`.replace('/./', '/')}.js)**|
 ---|`;

          fileContents += '\n'; // EOF

          addFileToWrite(filesToWrite, `${prefix}${componentName}.md`, fileContents);

          return Promise.resolve();
        });
    }));
}
function populateCategoryIntros(descriptors, allCategories) {
  // populate category intros for descriptors
  Object.keys(descriptors).forEach((componentName) => {
    const { propTypes, isResource } = descriptors[componentName];

    const ComponentInfo = getComponentInfo(componentName, propTypes);

    const componentInfo = new ComponentInfo();

    const intro = componentInfo.getIntro();

    const category = allCategories.flat[componentName];

    if (!category) {
      console.log('no category found for ', componentName); // eslint-disable-line
    } else {
      category.intro = intro;
    }

    if (isResource) {
      allCategories.flat['Resource Types'].data.resourceTypes.push(category);
    }
  });
}
module.exports = (done) => {
  clearImageDirectory();

  // mock global variables for three.js
  GLOBAL.self = {};

  // mock global variables for internal component propTypes
  GLOBAL.HTMLCanvasElement = class HTMLCanvasElement {
  };

  const THREE = require('three');

  Object.keys(THREE).forEach((key) => {
    const value = THREE[key];
    if (value && value.prototype) {
      THREE[key] = class MockedClass extends value {
        constructor(...rest) {
          super(...rest);

          this._args = rest;
        }

        toString() {
          return `new THREE.${key}(${this._args.join(', ')})`;
        }
      };

      THREE[key].displayName = `THREE.${key}`;

      const threeClass = THREE[key];

      Object.keys(value).forEach((objectKey) => {
        threeClass[objectKey] = {};
        threeClass[objectKey].toString = () => `THREE.${key}.${objectKey}`;
        threeClass[objectKey].isMockedThreeKey = true;
      });

      return;
    }

    THREE[key] = {};
    THREE[key].toString = () => `THREE.${key}`;
    THREE[key].isMockedThreeKey = true;
  });

  mockPropTypes();

  const allCategories = buildCategories();

  if (!fs.existsSync('wiki')) {
    throw new Error('Please load the wiki submodule!');
  }

  // noinspection NodeRequireContents
  const Module = require('module');

  const oldRequire = Module.prototype.require;

  function fakeRequire(requirePath) {
    Module.prototype.require = oldRequire;

    const oldValue = oldRequire.call(this, `${requirePath}`);

    Module.prototype.require = fakeRequire;

    if (requirePath.match(/\.\/descriptors\//)) {
      // babel runtime loaded

      oldValue.__modulePath = requirePath;
    }

    return oldValue;
  }

  Module.prototype.require = fakeRequire;

  const EDC = oldRequire.call(module, '../../src/lib/ElementDescriptorContainer');

  Module.prototype.require = oldRequire;

  const { descriptors } = new EDC({});

  populateCategoryIntros(descriptors, allCategories);

  const filesToWrite = {};

  const prefix = 'wiki/';

  writeDescriptors(descriptors, allCategories, filesToWrite, prefix).then(() => {
    // write categories
    writeCategories(allCategories, descriptors, filesToWrite, prefix);

    const fileNames = Object.keys(filesToWrite);

    for (let i = 0; i < fileNames.length; ++i) {
      const { filename, contents } = filesToWrite[fileNames[i]];
      fs.writeFileSync(filename, contents, 'utf8');
    }

    done();
  }, (error) => {
    console.error(error); // eslint-disable-line no-console

    return false;
  });

  return true;
};
