'use strict';

/* Services */

angular.module('app.directives', [])

.directive('projectTitleBar', function(
  ){
    return {
      restrict: 'E',
      scope: {
      },
      templateUrl: 'components/projectTitleBar.html'
    }
  })

.directive('attributeListElement', function(
  ){
    return {
      restrict: 'A',
      scope: {
      	att: '='
      },
      templateUrl: 'components/attributeListElement.html'
    }
  })