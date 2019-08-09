'use strict'

/* Services */

angular
  .module('minivan.netBundleManager', [])

  .factory('netBundleManager', function($http, $timeout, paletteGenerator) {
    var ns = {} // namespace
    ns.bundleVersion = '1.0.0'
    ns.ignored_node_attributes = ['label', 'x', 'y', 'z', 'size', 'color']
    ns.ignored_edge_attributes = ['label', 'color']
    var defaults = {
      title: 'Untitled Network',
      authors: [],
      date: 'Unknown',
      url: undefined,
      doi: undefined,
      description: 'This network has no description.',
      bundleVersion: ns.bundleVersion,
    }

    // Sets the passed value and if none sets a default value if the attribute is required
    ns.setBundleAttribute = function(bundle, attribute, value, verbose) {
      if (value !== undefined) {
        bundle[attribute] = value
        if (verbose) {
          console.warn(attribute + ' set to ', bundle[attribute])
        }
      } else if (bundle[attribute] === undefined) {
        if (defaults[attribute] !== undefined) {
          bundle[attribute] = defaults[attribute]
          if (verbose) {
            console.warn(
              attribute + ' missing, set to default:',
              bundle[attribute]
            )
          }
        }
      } else if (verbose) {
        console.warn(attribute + ' found:', bundle[attribute])
      }
    }

    ns.importBundle = function(fileLocation, callback, verbose) {
      $http.get(fileLocation).then(
        function(r) {
          ns.parseBundle(r.data, callback, verbose)
        },
        function(e) {
          console.error(
            'Error loading file at location:',
            fileLocation,
            '\n',
            e
          )
        }
      )
    }

    ns.parseBundle = function(bundle, callback, verbose) {
      var deserializedGraph = new Graph(bundle.settings || {})
      deserializedGraph.import(bundle.graph)
      bundle.g = deserializedGraph

      // Build attributes indexes
      // TODO: [new-bundle] overloading bundle could be problematic
      bundle.nodeAttributesIndex = {}
      bundle.model.nodeAttributes.forEach(function(d) {
        bundle.nodeAttributesIndex[d.id] = d
      })
      bundle.edgeAttributesIndex = {}
      bundle.model.edgeAttributes.forEach(function(d) {
        bundle.edgeAttributesIndex[d.id] = d
      })

      // TODO: [new-bundle] probably need to update that
      if (!bundle.consolidated) {
        // Consolidate (indexes...)
        ns.consolidateBundle(bundle)
      }
      
      callback(bundle)
    }

    ns.importGEXF = function(fileLocation, callback, verbose) {
      $http.get(fileLocation).then(
        function(r) {
          var title = ns._toTitleCase(
            fileLocation
              .substring(fileLocation.lastIndexOf('/') + 1)
              .replace(/\..*/gi, '')
          )
          ns.parseGEXF(r.data, title, callback, verbose)
        },
        function() {
          console.error('Error loading file at location:', fileLocation)
        }
      )
    }

    ns.parseGEXF = function(data, title, callback, verbose) {
      var graph = Graph.library.gexf.parse(Graph, data)

      var bundle = minivan.buildBundle(graph, {
        title: title
      })

      bundle.g = graph
      // Add default attributes when necessary
      ns.setBundleAttribute(bundle, 'title', title, verbose)
      ns.setBundleAttribute(bundle, 'authors', undefined, verbose)
      ns.setBundleAttribute(
        bundle,
        'date',
        bundle.g._attributes.lastModifiedDate,
        verbose
      )
      ns.setBundleAttribute(bundle, 'url', undefined, verbose)
      ns.setBundleAttribute(bundle, 'doi', undefined, verbose)
      ns.setBundleAttribute(
        bundle,
        'description',
        bundle.g._attributes.description,
        verbose
      )
      ns.setBundleAttribute(bundle, 'bundleVersion', ns.bundleVersion, verbose)

      // Set default node and edges size and color (for Home page)
      ns._setDefaultAttributes(bundle)
      
      bundle.nodeAttributesIndex = {}
      bundle.model.nodeAttributes.forEach(function(d) {
        bundle.nodeAttributesIndex[d.id] = d
      })
      bundle.edgeAttributesIndex = {}
      bundle.model.edgeAttributes.forEach(function(d) {
        bundle.edgeAttributesIndex[d.id] = d
      })

      // Consolidate (indexes...)
      callback(bundle)
    }

    ns.exportBundle = function(bundle) {
      const {nodeAttributesIndex, edgeAttributesIndex, ...cleanBundle} = bundle
      return angular.toJson(cleanBundle, null, '\t')
    }

    ns.slugify = function(str) {
      str = str.replace(/^\s+|\s+$/g, '') // trim
      str = str.toLowerCase()

      // remove accents, swap ñ for n, etc
      var from = 'àáäâèéëêìíïîòóöôùúüûñç·/_,:;'
      var to = 'aaaaeeeeiiiioooouuuunc------'
      for (var i = 0, l = from.length; i < l; i++) {
        str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
      }

      str = str
        .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
        .replace(/\s+/g, '-') // collapse whitespace and replace by -
        .replace(/-+/g, '-') // collapse dashes

      return str
    }

    ns.nodeAttributeNames = {}

    ns.buildNodeAttributesIndex = function(g) {
      console.log('mdr non ?');
      // FIXME: Slugify from Graphology directly if possible
      // Determine the slugs
      var slugIndex = {}
      ns.nodeAttributeNames = {}
      g.nodes().forEach(function(nid) {
        var n = g.getNodeAttributes(nid)
        console.log(n);
        d3.keys(n).forEach(function(k) {
          if (slugIndex[k] === undefined) {
            var slug = ns.slugify(k)
            console.log('avant:', k, 'après:', slug);
            while (ns.nodeAttributeNames[slug]) {
              // Detect collision
              slug = slug + '-'
            }
            slugIndex[k] = slug
            ns.nodeAttributeNames[slug] = ns._toTitleCase(k)
          }
        })
      })

      // Replace node attributes with slugs
      g.nodes().forEach(function(nid) {
        var n = g.getNodeAttributes(nid)
        var n2 = {}
        d3.keys(n).forEach(function(k) {
          n2[slugIndex[k]] = n[k]
        })
        d3.keys(n).forEach(function(k) {
          g.removeNodeAttribute(nid, k)
        })
        d3.keys(n2).forEach(function(sk) {
          g.setNodeAttribute(nid, sk, n2[sk])
        })
      })

      // Index all node attributes from GEXF
      var nodeAttributesIndex = {}
      g.nodes().forEach(function(nid) {
        var n = g.getNodeAttributes(nid)
        d3.keys(n).forEach(function(k) {
          if (nodeAttributesIndex[k]) {
            nodeAttributesIndex[k].count++
          } else {
            nodeAttributesIndex[k] = { count: 1 }
          }
        })
      })

      // Analyze the data of each node attribute
      d3.keys(nodeAttributesIndex).forEach(function(k) {
        var attData = nodeAttributesIndex[k]
        if (ns.ignored_node_attributes.indexOf(k) >= 0) {
          attData.type = 'ignore'
          return
        }

        // Gather variable types from the nodes
        attData.modalityTypes = {}
        g.nodes().forEach(function(nid) {
          var t = ns._getType(g.getNodeAttribute(nid, k))
          attData.modalityTypes[t] = (attData.modalityTypes[t] || 0) + 1
        })
      })
      ns._analyseAttributeIndex(
        g,
        g.nodes().map(function(nid) {
          return g.getNodeAttributes(nid)
        }),
        nodeAttributesIndex,
        ns.ignored_node_attributes
      )
      return nodeAttributesIndex
    }

    ns.edgeAttributeNames = {}

    ns.buildEdgeAttributesIndex = function(g) {
      // FIXME: Slugify from Graphology directly if possible
      // Determine the slugs
      var slugIndex = {}
      ns.edgeAttributeNames = {}
      g.edges().forEach(function(eid) {
        var e = g.getEdgeAttributes(eid)
        d3.keys(e).forEach(function(k) {
          if (slugIndex[k] === undefined) {
            var slug = ns.slugify(k)
            while (ns.edgeAttributeNames[slug]) {
              // Detect collision
              slug = slug + '-'
            }
            slugIndex[k] = slug
            ns.edgeAttributeNames[slug] = ns._toTitleCase(k)
          }
        })
      })

      // Replace edge attributes with slugs
      g.edges().forEach(function(eid) {
        var e = g.getEdgeAttributes(eid)
        var e2 = {}
        d3.keys(e).forEach(function(k) {
          e2[slugIndex[k]] = e[k]
        })
        d3.keys(e).forEach(function(k) {
          g.removeEdgeAttribute(eid, k)
        })
        d3.keys(e2).forEach(function(sk) {
          g.setEdgeAttribute(eid, sk, e2[sk])
        })
      })

      // Index all edge attributes from GEXF
      var edgeAttributesIndex = {}
      g.edges().forEach(function(eid) {
        var e = g.getEdgeAttributes(eid)
        d3.keys(e).forEach(function(k) {
          if (edgeAttributesIndex[k]) {
            edgeAttributesIndex[k].count++
          } else {
            edgeAttributesIndex[k] = { count: 1 }
          }
        })
      })

      // Analyze the data of each edge attribute
      d3.keys(edgeAttributesIndex).forEach(function(k) {
        var attData = edgeAttributesIndex[k]
        if (ns.ignored_edge_attributes.indexOf(k) >= 0) {
          attData.type = 'ignore'
          return
        }

        // Gather variable types from the nodes
        attData.modalityTypes = {}
        g.edges().forEach(function(eid) {
          var t = ns._getType(g.getEdgeAttribute(eid, k))
          attData.modalityTypes[t] = (attData.modalityTypes[t] || 0) + 1
        })
      })
      ns._analyseAttributeIndex(
        g,
        g.edges().map(function(eid) {
          return g.getEdgeAttributes(eid)
        }),
        edgeAttributesIndex,
        ns.ignored_edge_attributes
      )
      return edgeAttributesIndex
    }

    ns._analyseAttributeIndex = function(
      g,
      items,
      attributesIndex,
      ignored_attributes
    ) {
      d3.keys(attributesIndex).forEach(function(k) {
        var attData = attributesIndex[k]
        if (ignored_attributes.indexOf(k) >= 0) {
          attData.type = 'ignore'
          return
        }

        // Infer a data type
        if (attData.modalityTypes.string !== undefined) {
          attData.dataType = 'string'
        } else if (attData.modalityTypes.float !== undefined) {
          attData.dataType = 'float'
        } else if (attData.modalityTypes.integer !== undefined) {
          attData.dataType = 'integer'
        } else {
          attData.dataType = 'error'
        }

        // Aggregate the distribution of modalities
        attData.modalities = {}
        items.forEach(function(item) {
          var v = item[k]
          attData.modalities[v] = (attData.modalities[v] || 0) + 1
        })

        // Build stats for the distribution
        attData.stats = {}
        var modalityCountsArray = d3.values(attData.modalities)
        attData.stats.differentModalities = modalityCountsArray.length
        attData.stats.sizeOfSmallestModality = d3.min(modalityCountsArray)
        attData.stats.sizeOfBiggestModality = d3.max(modalityCountsArray)
        attData.stats.medianSize = d3.median(modalityCountsArray)
        attData.stats.deviation = d3.deviation(modalityCountsArray)
        attData.stats.modalitiesUnitary = modalityCountsArray.filter(function(
          d
        ) {
          return d == 1
        }).length
        attData.stats.modalitiesAbove1Percent = modalityCountsArray.filter(
          function(d) {
            return d >= g.order * 0.01
          }
        ).length
        attData.stats.modalitiesAbove10Percent = modalityCountsArray.filter(
          function(d) {
            return d >= g.order * 0.1
          }
        ).length

        // Decide what how the attribute should be visualized
        if (attData.dataType == 'string') {
          if (
            attData.stats.modalitiesAbove10Percent == 0 ||
            attData.stats.differentModalities < 2 ||
            attData.stats.differentModalities == g.order
          ) {
            attData.type = 'ignore'
          } else {
            attData.type = 'partition'
          }
        } else if (attData.dataType == 'float') {
          attData.type = 'ranking-size'
        } else if (attData.dataType == 'integer') {
          attData.type = 'ranking-size'
        } else {
          attData.type = 'ignore'
        }
      })
    }

    ns.createAttributeMetaData = function(g, attData) {
      debugger
      var settings = {}
      settings.max_colors = 10
      settings.min_proportion_for_a_color = 0.01
      settings.default_color = '#AAA'
      settings.min_node_size = 10
      settings.max_node_size = 100

      if (attData.type == 'ignore') {
        return
      } else {
        var att = {}
        if (attData.type == 'partition') {
          // Default settings for partition
          att.modalities = d3.keys(attData.modalities).map(function(m) {
            return {
              value: m,
              count: attData.modalities[m]
            }
          })
          var colors = ns.getColors(
            Math.min(
              settings.max_colors,
              att.modalities.filter(function(m) {
                return m.count / g.order >= settings.min_proportion_for_a_color
              }).length
            ),
            att.id // random seed
          )
          att.modalities.sort(function(a, b) {
            return b.count - a.count
          })
          att.modalities.forEach(function(m, i) {
            m.color = (colors[i] || settings.default_color).toString()
            debugger
          })
        } else if (attData.type == 'ranking-color') {
          var extent = d3.extent(d3.keys(attData.modalities), function(d) {
            return +d
          })
          att.min = extent[0]
          att.max = extent[1]
          att.colorScale = 'interpolateGreys'
          att.invertScale = false
          att.truncateScale = true
        } else if (attData.type == 'ranking-size') {
          var extent = d3.extent(d3.keys(attData.modalities), function(d) {
            return +d
          })
          att.min = extent[0]
          att.max = extent[1]
          att.areaScaling = {
            min: settings.min_node_size,
            max: settings.max_node_size,
            interpolation: 'linear'
          }
        }
        return att
      }
    }

    ns._setDefaultAttributes = function(bundle) {
      // Is there a node attribute partition?
      bundle.model.nodeAttributes.some(function(na) {
        if (na.type == 'partition') {
          bundle.model.defaultNodeColor = na.id
          return true
        } else return false
      })
      // If not, is there a ranking-color?
      if (!bundle.model.defaultNodeColor) {
        bundle.model.nodeAttributes.some(function(na) {
          if (na.type == 'ranking-color') {
            bundle.model.defaultNodeColor = na.id
            return true
          } else return false
        })
      }

      // Is there a node attribute ranking-size?
      bundle.model.nodeAttributes.some(function(na) {
        if (na.type == 'ranking-size') {
          bundle.model.defaultNodeSize = na.id
          return true
        } else return false
      })

      // If no node color, look for edge colors
      // (we do not want too much color)
      if (!bundle.model.defaultNodeColor) {
        // Is there an edge attribute partition?
        bundle.model.edgeAttributes.some(function(ea) {
          if (ea.type == 'partition') {
            bundle.model.defaultEdgeColor = ea.id
            return true
          } else return false
        })

        // If not, is there a ranking-color?
        if (!bundle.model.defaultEdgeColor) {
          bundle.model.edgeAttributes.some(function(ea) {
            if (ea.type == 'ranking-color') {
              bundle.model.defaultEdgeColor = ea.id
              return true
            } else return false
          })
        }
      }

      // Is there an edge attribute ranking-size?
      bundle.model.edgeAttributes.some(function(ea) {
        if (ea.type == 'ranking-size') {
          bundle.model.defaultEdgeSize = ea.id
          return true
        } else return false
      })
    }

    ns._toTitleCase = function(str) {
      return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      })
    }

    ns._getType = function(str) {
      // Adapted from http://stackoverflow.com/questions/16775547/javascript-guess-data-type-from-string
      if (str === undefined) str = 'undefined'
      if (typeof str !== 'string') str = str.toString()
      var nan = isNaN(Number(str))
      var isfloat = /^\d*(\.|,)\d*$/
      var commaFloat = /^(\d{0,3}(,)?)+\.\d*$/
      var dotFloat = /^(\d{0,3}(\.)?)+,\d*$/
      if (!nan) {
        if (parseFloat(str) === parseInt(str)) return 'integer'
        else return 'float'
      } else if (
        isfloat.test(str) ||
        commaFloat.test(str) ||
        dotFloat.test(str)
      )
        return 'float'
      else return 'string'
    }

    ns.getColors = function(count, randomSeed, settings) {
      console.log('hello ?')
      debugger;
      settings = settings || {}
      settings.cmin = settings.cmin || 25.59
      settings.cmax = settings.cmax || 55.59
      settings.lmin = settings.lmin || 60.94
      settings.lmax = settings.lmax || 90.94

      if (count == 0) {
        return []
      } else if (count == 1) {
        return ['#666']
      }
      // Generate colors (as Chroma.js objects)
      var colors = paletteGenerator.generate(
        count, // Colors
        function(color) {
          // This function filters valid colors
          var hcl = d3.hcl(color)
          return (
            hcl.c >= settings.cmin &&
            hcl.c <= settings.cmax &&
            hcl.l >= settings.lmin &&
            hcl.l <= settings.lmax
          )
        },
        false, // Using Force Vector instead of k-Means
        50, // Steps (quality)
        false, // Ultra precision
        'Default', // Color distance type (colorblindness)
        randomSeed // Random seed. Undefined = Math.random
      )
      // Sort colors by differenciation first
      colors = paletteGenerator.diffSort(colors, 'Default')
      return colors
    }

    ns.colorScales = [
      'interpolateGreys',
      'interpolateGreens',
      'interpolateBlues',
      'interpolatePurples',
      'interpolateReds',
      'interpolateOranges',
      'interpolateViridis',
      'interpolateInferno',
      'interpolateMagma',
      'interpolatePlasma',
      'interpolateWarm',
      'interpolateCool',
      'interpolateCubehelixDefault',
      'interpolateBuGn',
      'interpolateBuPu',
      'interpolateGnBu',
      'interpolateOrRd',
      'interpolatePuBuGn',
      'interpolatePuBu',
      'interpolatePuRd',
      'interpolateRdPu',
      'interpolateYlGnBu',
      'interpolateYlGn',
      'interpolateYlOrBr',
      'interpolateYlOrRd'
    ]

    return ns
  })
